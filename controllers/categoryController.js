const Category = require('../models/Category');
const { clearCache } = require('../middleware/cache');

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, description, icon } = req.body;

    // Check if category already exists
    const existingCategory = await Category.findOne({ 
      name: new RegExp(`^${name}$`, 'i') // Case insensitive match
    });
    
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const category = new Category({
      name,
      description,
      icon
    });

    await category.save();

    // Clear cache for categories
    clearCache('/categories');

    res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all categories
exports.getCategories = async (req, res) => {
  try {
    const { isActive } = req.query;
    
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const categories = await Category.find(query).sort({ name: 1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Get category by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, icon, isActive } = req.body;

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if name already exists (excluding current category)
    if (name) {
      const existingCategory = await Category.findOne({ 
        name: new RegExp(`^${name}$`, 'i'),
        _id: { $ne: req.params.id }
      });
      
      if (existingCategory) {
        return res.status(400).json({ error: 'Category name already exists' });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (icon) updateData.icon = icon;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // Clear cache for categories
    clearCache('/categories');
    clearCache(`/categories/${req.params.id}`);

    res.json({
      success: true,
      data: updatedCategory
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Clear cache for categories
    clearCache('/categories');
    clearCache(`/categories/${req.params.id}`);

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};