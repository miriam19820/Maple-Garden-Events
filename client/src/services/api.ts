// src/utils/api.ts

// זוהי עטיפה חכמה לפונקציית ה-fetch הרגילה
export const apiFetch = async (url: string, options: RequestInit = {}) => {
  // שולפים את הטוקן מהזיכרון של הדפדפן
  const token = localStorage.getItem('managerToken');

  // מכינים את ההדרים (Headers)
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // אם יש טוקן, מוסיפים אותו אוטומטית להדר של ה-Authorization
  if (token) {
    (headers as any)['Authorization'] = `Bearer ${token}`;
  }

  // מבצעים את הקריאה לשרת עם ההדרים המעודכנים
  const response = await fetch(url, {
    ...options,
    headers,
  });

  // אם השרת מחזיר 401 (גישה נדחתה), זה אומר שהטוקן פג תוקף או נמחק
  if (response.status === 401) {
    localStorage.removeItem('managerToken');
    window.location.href = '/'; // זורק את המשתמש חזרה למסך הלוגין
  }

  return response;
};