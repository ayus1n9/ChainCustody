// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ChainCustody.sol";

/// @title RoleCouncil
/// @notice M-of-N multi-signature administrative council for ChainCustody party registration and deregistration.
///         Enforces the two-person rule to eliminate single-point-of-failure admin privileges.
contract RoleCouncil {
    // ------------------------------------------------------------------ custom errors
    error NotCouncilMember();
    error InvalidThreshold();
    error InvalidMember();
    error DuplicateMember();
    error ProposalNotFound();
    error ProposalAlreadyExecuted();
    error ProposalHasExpired();
    error AlreadyApproved();
    error ProposalNotApproved();
    error InvalidRole();

    // ------------------------------------------------------------------ types
    enum ActionType { Register, Deregister }

    struct Proposal {
        uint256 id;
        ActionType action;
        address targetParty;
        ChainCustody.Role role;
        address proposer;
        uint64 createdAt;
        uint64 expiresAt;
        uint32 approvalCount;
        bool executed;
    }

    // ------------------------------------------------------------------ events
    event ProposalCreated(
        uint256 indexed proposalId,
        ActionType action,
        address indexed targetParty,
        ChainCustody.Role role,
        address indexed proposer,
        uint64 expiresAt
    );
    event ProposalApproved(uint256 indexed proposalId, address indexed approver);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalExpired(uint256 indexed proposalId);

    // ------------------------------------------------------------------ constants & storage
    uint64 public constant PROPOSAL_LIFETIME = 7 days;

    ChainCustody public immutable custody;
    uint256 public immutable m; // Required approvals
    uint256 public immutable n; // Total members

    address[] public members;
    mapping(address => bool) public isMember;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    // ------------------------------------------------------------------ modifiers
    modifier onlyMember() {
        if (!isMember[msg.sender]) revert NotCouncilMember();
        _;
    }

    // ------------------------------------------------------------------ constructor
    constructor(address[] memory _members, uint256 _threshold, address _custody) {
        if (_threshold == 0 || _threshold > _members.length) revert InvalidThreshold();
        m = _threshold;
        n = _members.length;

        for (uint256 i = 0; i < _members.length; i++) {
            address member = _members[i];
            if (member == address(0)) revert InvalidMember();
            if (isMember[member]) revert DuplicateMember();
            isMember[member] = true;
            members.push(member);
        }

        if (_custody == address(0)) {
            custody = new ChainCustody();
        } else {
            custody = ChainCustody(_custody);
        }
    }

    // ------------------------------------------------------------------ proposals
    function proposeRegisterParty(
        address targetParty,
        ChainCustody.Role role
    ) external onlyMember returns (uint256 proposalId) {
        if (role == ChainCustody.Role.None) revert InvalidRole();
        if (targetParty == address(0)) revert InvalidMember();

        proposalId = ++proposalCount;
        uint64 nowSec = uint64(block.timestamp);
        uint64 expires = nowSec + PROPOSAL_LIFETIME;

        proposals[proposalId] = Proposal({
            id: proposalId,
            action: ActionType.Register,
            targetParty: targetParty,
            role: role,
            proposer: msg.sender,
            createdAt: nowSec,
            expiresAt: expires,
            approvalCount: 1,
            executed: false
        });

        hasApproved[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, ActionType.Register, targetParty, role, msg.sender, expires);
        emit ProposalApproved(proposalId, msg.sender);
    }

    function proposeDeregisterParty(
        address targetParty
    ) external onlyMember returns (uint256 proposalId) {
        if (targetParty == address(0)) revert InvalidMember();

        proposalId = ++proposalCount;
        uint64 nowSec = uint64(block.timestamp);
        uint64 expires = nowSec + PROPOSAL_LIFETIME;

        proposals[proposalId] = Proposal({
            id: proposalId,
            action: ActionType.Deregister,
            targetParty: targetParty,
            role: ChainCustody.Role.None,
            proposer: msg.sender,
            createdAt: nowSec,
            expiresAt: expires,
            approvalCount: 1,
            executed: false
        });

        hasApproved[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, ActionType.Deregister, targetParty, ChainCustody.Role.None, msg.sender, expires);
        emit ProposalApproved(proposalId, msg.sender);
    }

    function approve(uint256 proposalId) external onlyMember {
        Proposal storage p = proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound();
        if (p.executed) revert ProposalAlreadyExecuted();
        if (block.timestamp > p.expiresAt) revert ProposalHasExpired();
        if (hasApproved[proposalId][msg.sender]) revert AlreadyApproved();

        hasApproved[proposalId][msg.sender] = true;
        p.approvalCount++;

        emit ProposalApproved(proposalId, msg.sender);
    }

    function execute(uint256 proposalId) external onlyMember {
        Proposal storage p = proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound();
        if (p.executed) revert ProposalAlreadyExecuted();
        if (block.timestamp > p.expiresAt) revert ProposalHasExpired();
        if (p.approvalCount < m) revert ProposalNotApproved();

        p.executed = true;

        if (p.action == ActionType.Register) {
            custody.registerParty(p.targetParty, p.role);
        } else if (p.action == ActionType.Deregister) {
            custody.deregisterParty(p.targetParty);
        }

        emit ProposalExecuted(proposalId);
    }

    function expire(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound();
        if (p.executed) revert ProposalAlreadyExecuted();
        if (block.timestamp <= p.expiresAt) revert ProposalNotApproved();

        emit ProposalExpired(proposalId);
    }

    // ------------------------------------------------------------------ views
    function getMembers() external view returns (address[] memory) {
        return members;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        Proposal memory p = proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound();
        return p;
    }

    function isExpired(uint256 proposalId) external view returns (bool) {
        Proposal memory p = proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound();
        return block.timestamp > p.expiresAt;
    }
}
