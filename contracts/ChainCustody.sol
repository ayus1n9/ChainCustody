// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChainCustody
/// @notice Chain of custody for digital evidence. Only a file HASH, a storage
///         content-ID (CID) and access metadata live on-chain. The evidence file
///         itself is AES-256-GCM encrypted and stored off-chain (e.g. IPFS).
/// @dev    On-chain data is PUBLIC. Confidentiality comes from client-side
///         encryption; the contract provides authorization, an immutable audit
///         trail and tamper-evidence (hash anchoring).
contract ChainCustody {
    // ------------------------------------------------------------------ types
    enum Role { None, Investigator, Lab, Court, Defense }

    struct Evidence {
        bytes32 fileHash;   // SHA-256 of the ORIGINAL plaintext file
        string cid;         // content identifier of the ENCRYPTED file off-chain
        address custodian;  // current holder in the chain of custody
        uint64 createdAt;
    }

    // ---------------------------------------------------------------- storage
    address public immutable admin;
    uint256 public evidenceCount;

    mapping(address => Role) public roleOf;
    mapping(bytes32 => uint256) public idByHash;                       // duplicate guard
    mapping(uint256 => Evidence) private _evidence;
    mapping(uint256 => mapping(address => bool)) public hasAccess;
    mapping(uint256 => mapping(address => bytes)) private _wrappedKey; // AES key, encrypted per recipient
    mapping(uint256 => address) public proposedCustodianOf;            // pending 2-step custody transfer
    mapping(uint256 => bytes) private _pendingWrappedKey;

    // ----------------------------------------------------------------- errors
    error NotAdmin();
    error NotAuthorized();
    error EvidenceNotFound();
    error NotCustodian();
    error AlreadyRegistered();
    error PartyNotRegistered();
    error AccessDenied();
    error InvalidInput();
    error NothingToRevoke();
    error CannotRevokeCustodian();
    error NoTransferPending();
    error NotProposedCustodian();

    // ----------------------------------------------------------------- events
    // Events form the immutable audit trail of the chain of custody.
    event PartyRegistered(address indexed party, Role role);
    event EvidenceRegistered(uint256 indexed id, bytes32 indexed fileHash, string cid, address indexed custodian, uint256 timestamp);
    event AccessGranted(uint256 indexed id, address indexed by, address indexed to, uint256 timestamp);
    event AccessRevoked(uint256 indexed id, address indexed by, address indexed from, uint256 timestamp);
    event AccessLogged(uint256 indexed id, address indexed party, uint256 timestamp);
    event CustodyTransferred(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp);
    event CustodyTransferProposed(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp);
    event CustodyTransferCancelled(uint256 indexed id, address indexed by, address indexed to, uint256 timestamp);

    // -------------------------------------------------------------- modifiers
    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier exists(uint256 id) {
        if (id == 0 || id > evidenceCount) revert EvidenceNotFound();
        _;
    }

    modifier onlyCustodian(uint256 id) {
        if (id == 0 || id > evidenceCount) revert EvidenceNotFound();
        if (_evidence[id].custodian != msg.sender) revert NotCustodian();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ------------------------------------------------------------ party setup
    /// @notice Admin registers (or re-assigns) a party with a role.
    function registerParty(address party, Role role) external onlyAdmin {
        if (party == address(0) || role == Role.None) revert InvalidInput();
        roleOf[party] = role;
        emit PartyRegistered(party, role);
    }

    /// @notice Admin de-registers a party, removing their role.
    function deregisterParty(address party) external onlyAdmin {
        if (party == address(0) || roleOf[party] == Role.None) revert InvalidInput();
        roleOf[party] = Role.None;
        emit PartyRegistered(party, Role.None);
    }

    // --------------------------------------------------------------- evidence
    /// @notice An investigator registers new evidence. The caller becomes the custodian.
    /// @param fileHash    SHA-256 of the original file (computed client-side)
    /// @param cid         content ID of the encrypted file in off-chain storage
    /// @param wrappedKey  the AES key encrypted for the caller's public key
    function registerEvidence(bytes32 fileHash, string calldata cid, bytes calldata wrappedKey)
        external
        returns (uint256 id)
    {
        if (roleOf[msg.sender] != Role.Investigator) revert NotAuthorized();
        if (fileHash == bytes32(0) || bytes(cid).length == 0) revert InvalidInput();
        if (idByHash[fileHash] != 0) revert AlreadyRegistered();
        if (wrappedKey.length == 0) revert InvalidInput();

        id = ++evidenceCount;
        _evidence[id] = Evidence(fileHash, cid, msg.sender, uint64(block.timestamp));
        idByHash[fileHash] = id;
        hasAccess[id][msg.sender] = true;
        _wrappedKey[id][msg.sender] = wrappedKey;

        emit EvidenceRegistered(id, fileHash, cid, msg.sender, block.timestamp);
    }

    /// @notice Custodian grants a registered party access (and supplies the AES key wrapped for them).
    function grantAccess(uint256 id, address to, bytes calldata wrappedKey) external onlyCustodian(id) {
        if (roleOf[to] == Role.None) revert PartyNotRegistered();
        if (wrappedKey.length == 0) revert InvalidInput();
        hasAccess[id][to] = true;
        _wrappedKey[id][to] = wrappedKey;
        emit AccessGranted(id, msg.sender, to, block.timestamp);
    }

    /// @notice Custodian revokes a party's access. History stays in the audit log.
    function revokeAccess(uint256 id, address from) external onlyCustodian(id) {
        if (from == _evidence[id].custodian) revert CannotRevokeCustodian();
        if (!hasAccess[id][from]) revert NothingToRevoke();
        hasAccess[id][from] = false;
        delete _wrappedKey[id][from];
        emit AccessRevoked(id, msg.sender, from, block.timestamp);
    }

    /// @notice Custodian hands custody to another registered party (the "chain" in chain of custody).
    function transferCustody(uint256 id, address newCustodian, bytes calldata wrappedKey)
        external
        onlyCustodian(id)
    {
        if (roleOf[newCustodian] == Role.None) revert PartyNotRegistered();
        if (newCustodian == msg.sender || wrappedKey.length == 0) revert InvalidInput();

        _evidence[id].custodian = newCustodian;
        hasAccess[id][newCustodian] = true;
        _wrappedKey[id][newCustodian] = wrappedKey;

        emit CustodyTransferred(id, msg.sender, newCustodian, block.timestamp);
    }

    /// @notice Custodian proposes transferring custody to another registered party (Step 1 of 2-step handover).
    function proposeCustodyTransfer(uint256 id, address to, bytes calldata wrappedKey)
        external
        onlyCustodian(id)
    {
        if (roleOf[to] == Role.None) revert PartyNotRegistered();
        if (to == msg.sender || wrappedKey.length == 0) revert InvalidInput();

        proposedCustodianOf[id] = to;
        _pendingWrappedKey[id] = wrappedKey;

        emit CustodyTransferProposed(id, msg.sender, to, block.timestamp);
    }

    /// @notice Custodian cancels a pending custody transfer proposal.
    function cancelCustodyTransfer(uint256 id) external onlyCustodian(id) {
        address pending = proposedCustodianOf[id];
        if (pending == address(0)) revert NoTransferPending();

        delete proposedCustodianOf[id];
        delete _pendingWrappedKey[id];

        emit CustodyTransferCancelled(id, msg.sender, pending, block.timestamp);
    }

    /// @notice Proposed party accepts custody handover (Step 2 of 2-step handover).
    function acceptCustody(uint256 id) external exists(id) {
        if (proposedCustodianOf[id] != msg.sender) revert NotProposedCustodian();

        address prevCustodian = _evidence[id].custodian;
        _evidence[id].custodian = msg.sender;
        hasAccess[id][msg.sender] = true;
        _wrappedKey[id][msg.sender] = _pendingWrappedKey[id];

        delete proposedCustodianOf[id];
        delete _pendingWrappedKey[id];

        emit CustodyTransferred(id, prevCustodian, msg.sender, block.timestamp);
    }

    /// @notice An authorized party records that they accessed the evidence.
    ///         Reverts (and so records nothing) if the caller is not authorized.
    function logAccess(uint256 id) external exists(id) {
        if (!hasAccess[id][msg.sender]) revert AccessDenied();
        emit AccessLogged(id, msg.sender, block.timestamp);
    }

    // ------------------------------------------------------------------ views
    function getEvidence(uint256 id)
        external
        view
        exists(id)
        returns (bytes32 fileHash, string memory cid, address custodian, uint64 createdAt)
    {
        Evidence storage e = _evidence[id];
        return (e.fileHash, e.cid, e.custodian, e.createdAt);
    }

    function getWrappedKey(uint256 id, address party) external view exists(id) returns (bytes memory) {
        return _wrappedKey[id][party];
    }

    /// @notice True if `candidateHash` equals the hash anchored at registration.
    function verifyIntegrity(uint256 id, bytes32 candidateHash) external view exists(id) returns (bool) {
        return _evidence[id].fileHash == candidateHash;
    }

    /// @notice Verifies whether a specific file hash is part of a bulk evidence dossier using a Merkle proof.
    /// @param id        Evidence identifier (where fileHash is the Merkle Root of the dossier)
    /// @param fileHash  SHA-256 hash of the specific leaf file
    /// @param proof     Array of sibling hashes forming the Merkle branch proof
    function verifyBatchInclusion(uint256 id, bytes32 fileHash, bytes32[] calldata proof)
        external
        view
        exists(id)
        returns (bool)
    {
        bytes32 computedHash = fileHash;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = sha256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = sha256(abi.encodePacked(proofElement, computedHash));
            }
        }
        return computedHash == _evidence[id].fileHash;
    }
}
