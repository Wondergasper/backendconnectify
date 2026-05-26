const { BaseRepository, ensureNoError } = require('./baseRepository');
const { mapCategoryRow } = require('./mappers');

class CategoryRepository extends BaseRepository {
  constructor(clientFactory) {
    super('categories', mapCategoryRow, clientFactory);
  }

  async findByName(name, excludeId) {
    let query = this.table()
      .select('*')
      .ilike('name', name)
      .limit(1);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const result = await query.maybeSingle();
    return mapCategoryRow(ensureNoError(result, 'Find category by name'));
  }

  async listCategories({ isActive } = {}) {
    let query = this.table().select('*');

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    const result = await query.order('name', { ascending: true });
    return (ensureNoError(result, 'List categories') || []).map(mapCategoryRow);
  }

  async createCategory({ name, description, icon, image }) {
    return this.insert({
      name,
      description,
      icon: icon || 'services',
      image
    });
  }

  async updateCategory(id, updates) {
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.icon !== undefined) payload.icon = updates.icon;
    if (updates.image !== undefined) payload.image = updates.image;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    return this.updateById(id, payload);
  }

  async deleteCategory(id) {
    const result = await this.table().delete().eq('id', id).select('*').maybeSingle();
    return mapCategoryRow(ensureNoError(result, 'Delete category'));
  }
}

module.exports = {
  CategoryRepository,
  categoryRepository: new CategoryRepository()
};
