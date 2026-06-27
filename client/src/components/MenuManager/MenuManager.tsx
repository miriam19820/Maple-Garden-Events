import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { menuService } from '../../services/menuService';
import { useMenuQuery } from '../../hooks/queries';

const MenuManager = () => {
  const queryClient = useQueryClient();
  const { data: menu = [] } = useMenuQuery();
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const refreshMenu = () => queryClient.invalidateQueries({ queryKey: ['menu'] });

  const handleAdd = async () => {
    if (!newName || !newPrice) return alert("נא למלא שם ומחיר");

    await menuService.addDish({
      name: newName,
      price: parseFloat(newPrice),
      categoryId: menu[0]?.id || ""
    });

    setNewName('');
    setNewPrice('');
    refreshMenu();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('את בטוחה שאת רוצה למחוק?')) {
      await menuService.deleteDish(id);
      refreshMenu();
    }
  };

  return (
    <div style={{ padding: '20px', direction: 'rtl' }}>
      <h1>ניהול תפריט</h1>

      <div style={{ marginBottom: '30px', padding: '15px', background: '#f4f4f4' }}>
        <h3>הוספת מנה חדשה</h3>
        <input placeholder="שם המנה" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input placeholder="מחיר" type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
        <button onClick={handleAdd}>הוסף מנה</button>
      </div>

      {menu.map((category: { id: string; name: string; dishes: { id: string; name: string; price: number }[] }) => (
        <div key={category.id} style={{ marginBottom: '20px' }}>
          <h2>{category.name}</h2>
          <ul>
            {category.dishes.map((dish) => (
              <li key={dish.id}>
                {dish.name} - {dish.price} ₪
                <button onClick={() => handleDelete(dish.id)} style={{ color: 'red', marginRight: '10px' }}>מחק</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default MenuManager;
