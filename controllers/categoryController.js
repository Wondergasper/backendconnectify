const { categoryRepository } = require('../repositories/supabase/categoryRepository');
const { clearCache } = require('../middleware/cache');

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, description, icon } = req.body;

    // Check if category already exists
    const existingCategory = await categoryRepository.findByName(name);
    
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const category = await categoryRepository.createCategory({ name, description, icon });

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
    
    const categories = await categoryRepository.listCategories({
      isActive: isActive === undefined ? undefined : isActive === 'true'
    });

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
    const category = await categoryRepository.findById(req.params.id);

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

    const category = await categoryRepository.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if name already exists (excluding current category)
    if (name) {
      const existingCategory = await categoryRepository.findByName(name, req.params.id);
      
      if (existingCategory) {
        return res.status(400).json({ error: 'Category name already exists' });
      }
    }

    const updatedCategory = await categoryRepository.updateCategory(req.params.id, {
      name,
      description,
      icon,
      isActive
    });

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
    const category = await categoryRepository.deleteCategory(req.params.id);

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
