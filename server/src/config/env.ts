import dotenv from 'dotenv';

// טעינת משתני הסביבה מקובץ .env
dotenv.config();

const requiredEnvVars = [
  'DATABASE_URL',
  // 'EMAIL_USER', // דוגמא למשתנים שתרצה לוודא שקיימים בהמשך
  // 'EMAIL_PASS',
];

export const validateEnv = () => {
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  if (missing.length > 0) {
    console.error(`❌ שגיאה קריטית: חסרים משתני סביבה הכרחיים: ${missing.join(', ')}`);
    process.exit(1); // עצירת השרת אם חסר משהו קריטי
  }
  console.log('✅ כל משתני הסביבה נטענו בהצלחה.');
};