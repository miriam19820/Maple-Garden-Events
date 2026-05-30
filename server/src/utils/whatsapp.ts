// src/utils/whatsapp.ts

export const sendBumpWhatsApp = async (clientPhone: string, clientName: string, eventDate: string, deadline: Date) => {
  const deadlineStr = deadline.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date(eventDate).toLocaleDateString('he-IL');

  // בוואטסאפ אנחנו משתמשים בכוכבית (*) כדי להדגיש טקסט (Bold)
  const message = `שלום *${clientName}*,\n\n` +
    `אנו מודים לך שבחרת להתעניין בקיום האירוע שלך בגן האירועים *מייפל* 🍁.\n` +
    `התאריך ששמרת כאופציה (*${dateStr}*) הינו מבוקש מאוד, וכרגע יש לקוח נוסף שמעוניין לסגור אירוע במועד זה.\n\n` +
    `⏳ *החלטה דחופה נדרשת:*\n` +
    `על מנת להבטיח את התאריך שלך, אנא צור איתנו קשר עד השעה *${deadlineStr}*.\n` +
    `לאחר שעה זו, האופציה תשתחרר אוטומטית והתאריך יהיה פנוי ללקוח הבא.\n\n` +
    `נשמח לחגוג איתכם!\n` +
    `*צוות מייפל - גן אירועים בעיר*\n` +
    `טלפון: 03-6777772`;

  try {
    // 💡 כרגע אנחנו רק מדפיסים ללוג. בעתיד, כאן תיכנס קריאת ה-API לספק הוואטסאפ (כמו Green-API)
    // await axios.post('https://api.whatsapp-provider.com/send', { phone: clientPhone, text: message });

    console.log(`[WHATSAPP SIMULATION] מכין שליחת הודעת וואטסאפ לטלפון: ${clientPhone}...`);
    console.log(`------------ תוכן ההודעה ------------\n${message}\n-------------------------------------`);
    
    console.log(`[WHATSAPP SIMULATION] ✅ הודעת הוואטסאפ נשלחה בהצלחה ל-${clientName}!`);
    return true;
  } catch (error) {
    console.error('שגיאה בשליחת הוואטסאפ:', error);
    return false;
  }
};