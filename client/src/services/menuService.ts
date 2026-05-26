// client/src/services/menuService.ts
const API_URL = 'http://localhost:5000/api/menu';

export const menuService = {
  getMenu: async () => {
    const res = await fetch(API_URL);
    return res.json();
  },
  addDish: async (dishData: { name: string; price: number; categoryId: string }) => {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dishData),
    });
    return res.json();
  },
  deleteDish: async (id: string) => {
    const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    return res.json();
  }
};