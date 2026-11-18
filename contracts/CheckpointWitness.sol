// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CheckpointWitness
/// @notice Deployed on a chain that the custody chain's operator does not control.
///         Registered witnesses (for example the court and the defence) post the
///         block hash of the custody chain at increasing heights. Anyone can later
///         compare the custody chain with these checkpoints: a mismatch at any
///         height proves that history at or below that height was rewritten.
contract CheckpointWitness {
    address public immutable owner;
    mapping(address => bool) public isWitness;
    mapping(bytes32 => mapping(uint64 => bytes32)) public anchored; // chainTag => height => block hash
    mapping(bytes32 => uint64) public latestHeight;                  // chainTag => last checkpointed height

    event WitnessSet(address indexed witness, bool allowed);
    event Checkpointed(bytes32 indexed chainTag, uint64 indexed height, bytes32 blockHash, address indexed witness);

    error NotOwner();
    error NotWitness();
    error StaleCheckpoint();
    error InvalidInput();

    constructor() {
        owner = msg.sender;
    }

    function setWitness(address w, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        isWitness[w] = allowed;
        emit WitnessSet(w, allowed);
    }

    /// @notice Record the custody chain's block hash at `height`. Heights must increase.
    function checkpoint(bytes32 chainTag, uint64 height, bytes32 blockHash) external {
        if (!isWitness[msg.sender]) revert NotWitness();
        if (blockHash == bytes32(0)) revert InvalidInput();
        if (height <= latestHeight[chainTag]) revert StaleCheckpoint();
        anchored[chainTag][height] = blockHash;
        latestHeight[chainTag] = height;
        emit Checkpointed(chainTag, height, blockHash, msg.sender);
    }

    /// @notice True if `blockHash` equals the checkpoint at `height` (false when none exists).
    function matches(bytes32 chainTag, uint64 height, bytes32 blockHash) external view returns (bool) {
        bytes32 a = anchored[chainTag][height];
        return a != bytes32(0) && a == blockHash;
    }
}
