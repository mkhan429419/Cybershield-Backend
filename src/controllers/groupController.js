const Group = require('../models/Group');
const User = require('../models/User');

// POST /api/orgs/:orgId/groups
const createGroup = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Check if group with same name already exists in the organization
    const existingGroup = await Group.findOne({ orgId, name });
    if (existingGroup) {
      return res.status(400).json({ error: 'Group with this name already exists in the organization' });
    }

    const group = new Group({
      orgId,
      name,
      memberCount: 0
    });

    await group.save();

    res.status(201).json({
      message: 'Group created successfully',
      group: {
        _id: group._id,
        name: group.name,
        memberCount: group.memberCount,
        orgId: group.orgId,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

// GET /api/orgs/:orgId/groups
const getGroups = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { page = 1, limit = 50, search } = req.query;

    const query = { orgId };
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const groups = await Group.find(query)
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Group.countDocuments(query);

    res.json({
      groups: groups.map(group => ({
        _id: group._id,
        name: group.name,
        memberCount: group.memberCount,
        orgId: group.orgId,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      })),
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

// GET /api/orgs/:orgId/groups/:groupId
const getGroupById = async (req, res) => {
  try {
    const { orgId, groupId } = req.params;

    const group = await Group.findOne({ _id: groupId, orgId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get group members
    const members = await User.find({ 
      orgId, 
      groupIds: groupId,
      status: { $in: ['active', 'invited'] }
    })
    .select('_id email displayName role status createdAt')
    .sort({ displayName: 1 });

    res.json({
      group: {
        _id: group._id,
        name: group.name,
        memberCount: group.memberCount,
        orgId: group.orgId,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      },
      members: members.map(member => ({
        _id: member._id,
        email: member.email,
        displayName: member.displayName,
        role: member.role,
        status: member.status,
        createdAt: member.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
};

// PUT /api/orgs/:orgId/groups/:groupId
const updateGroup = async (req, res) => {
  try {
    const { orgId, groupId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Check if group exists
    const group = await Group.findOne({ _id: groupId, orgId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if another group with the same name exists (excluding current group)
    const existingGroup = await Group.findOne({ 
      orgId, 
      name, 
      _id: { $ne: groupId } 
    });
    if (existingGroup) {
      return res.status(400).json({ error: 'Group with this name already exists in the organization' });
    }

    group.name = name;
    await group.save();

    res.json({
      message: 'Group updated successfully',
      group: {
        _id: group._id,
        name: group.name,
        memberCount: group.memberCount,
        orgId: group.orgId,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
};

// DELETE /api/orgs/:orgId/groups/:groupId
const deleteGroup = async (req, res) => {
  try {
    const { orgId, groupId } = req.params;

    // Check if group exists
    const group = await Group.findOne({ _id: groupId, orgId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Remove group from all users
    await User.updateMany(
      { orgId, groupIds: groupId },
      { $pull: { groupIds: groupId } }
    );

    // Delete the group
    await Group.findByIdAndDelete(groupId);

    res.json({
      message: 'Group deleted successfully',
      deletedGroup: {
        _id: group._id,
        name: group.name,
        memberCount: group.memberCount
      }
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
};

// POST /api/orgs/:orgId/groups/:groupId/members
const addMemberToGroup = async (req, res) => {
  try {
    const { orgId, groupId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if group exists
    const group = await Group.findOne({ _id: groupId, orgId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user exists and belongs to the organization
    const user = await User.findOne({ _id: userId, orgId });
    if (!user) {
      return res.status(404).json({ error: 'User not found in this organization' });
    }

    // Check if user is already in the group
    if (user.groupIds.includes(groupId)) {
      return res.status(400).json({ error: 'User is already a member of this group' });
    }

    // Add user to group
    user.groupIds.push(groupId);
    await user.save();

    // Update group member count
    await Group.findByIdAndUpdate(groupId, { $inc: { memberCount: 1 } });

    res.json({
      message: 'User added to group successfully',
      user: {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      },
      group: {
        _id: group._id,
        name: group.name
      }
    });
  } catch (error) {
    console.error('Error adding member to group:', error);
    res.status(500).json({ error: 'Failed to add member to group' });
  }
};

// DELETE /api/orgs/:orgId/groups/:groupId/members/:userId
const removeMemberFromGroup = async (req, res) => {
  try {
    const { orgId, groupId, userId } = req.params;

    // Check if group exists
    const group = await Group.findOne({ _id: groupId, orgId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user exists and belongs to the organization
    const user = await User.findOne({ _id: userId, orgId });
    if (!user) {
      return res.status(404).json({ error: 'User not found in this organization' });
    }

    // Check if user is in the group
    if (!user.groupIds.includes(groupId)) {
      return res.status(400).json({ error: 'User is not a member of this group' });
    }

    // Remove user from group
    user.groupIds = user.groupIds.filter(id => id.toString() !== groupId);
    await user.save();

    // Update group member count
    await Group.findByIdAndUpdate(groupId, { $inc: { memberCount: -1 } });

    res.json({
      message: 'User removed from group successfully',
      user: {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      },
      group: {
        _id: group._id,
        name: group.name
      }
    });
  } catch (error) {
    console.error('Error removing member from group:', error);
    res.status(500).json({ error: 'Failed to remove member from group' });
  }
};

module.exports = {
  createGroup,
  getGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  addMemberToGroup,
  removeMemberFromGroup
};
