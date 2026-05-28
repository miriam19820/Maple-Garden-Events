// run-tests.js
// כדי להריץ, פתחי את הטרמינל בתיקיית השרת וכתבי: node run-tests.js

async function runTests() {
  const API_URL = 'http://localhost:5000/api/bookings'; // ודאי שהשרת דולק!

  console.log("🚀 מתחיל הרצת בדיקות אוטומטיות לשרת...\n");

  // טסט א': סגירת אירוע ודאי (תאריך אחד)
  const testA_Data = {
    allSelectedDates: [],
    calendarDateId: "2026-09-01",
    eventType: "חתונה",
    guestCount: 200,
    finalPricePortion: 350,
    clientAFullName: "ישראל ישראלי",
    clientAPhone: "050-1234567"
  };

  // טסט ב': שמירת אופציה (2 תאריכים)
  const testB_Data = {
    allSelectedDates: ["2026-10-05", "2026-10-06"],
    calendarDateId: "2026-10-05",
    eventType: "בר מצווה",
    guestCount: 150,
    finalPricePortion: 250,
    clientAFullName: "דוד כהן",
    clientAPhone: "052-7654321"
  };

  try {
    console.log("--- טסט א': סגירת אירוע לתאריך אחד (01-09-2026) ---");
    const resA = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testA_Data)
    });
    const resultA = await resA.json();
    console.log("✅ תוצאה:", resultA.message, "\n");

    console.log("--- טסט ב': שמירת אופציה ל-2 תאריכים (05/10, 06/10) ---");
    const resB = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testB_Data)
    });
    const resultB = await resB.json();
    console.log("✅ תוצאה:", resultB.message, "\n");

    console.log("🎉 כל הטסטים רצו בהצלחה! אפשר לעבור לשלב 3.");

  } catch (error) {
    console.error("❌ שגיאה בהרצת הטסטים (האם השרת דולק?):", error.message);
  }
}

runTests();