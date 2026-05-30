import nodemailer from 'nodemailer';

// תשתית עתידית להתחברות ל-Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'fake-email@gmail.com', // בעתיד נוסיף את המייל שלך ל-ENV
    pass: process.env.EMAIL_PASS || 'fake-password',
  },
});

export const sendBumpEmail = async (clientEmail: string, clientName: string, eventDate: string, deadline: Date) => {
  const deadlineStr = deadline.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date(eventDate).toLocaleDateString('he-IL');

  // עיצוב HTML מלא למייל עם הלוגו של מייפל!
  const mailOptions = {
    from: '"גן אירועים מייפל" <maple.events.il@gmail.com>',
    to: clientEmail,
    subject: `עדכון חשוב לגבי התאריך שלך במייפל (${dateStr}) ⏳`,
    html: `
      <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        
        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-bottom: 3px solid #d97706;">
          <img src="cid:mapleLogo" alt="לוגו מייפל" style="max-width: 150px;" />
          <h2 style="color: #1f2937; margin: 15px 0 0 0;">החלטה דחופה נדרשת</h2>
        </div>

        <div style="padding: 25px;">
          <p style="font-size: 1.1rem;">שלום <strong>${clientName}</strong>,</p>
          <p style="font-size: 1.05rem; line-height: 1.5;">
            אנו מודים לך שבחרת להתעניין בקיום האירוע שלך בגן האירועים <strong>מייפל</strong>.<br/>
            התאריך ששמרת כאופציה (<strong>${dateStr}</strong>) הינו מבוקש מאוד, וכרגע יש לקוח נוסף שמעוניין לסגור אירוע במועד זה.
          </p>
          
          <div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 15px; margin: 25px 0; text-align: center;">
            <p style="color: #92400e; font-size: 1.1rem; margin: 0; font-weight: bold;">
              על מנת להבטיח את התאריך שלך, אנא צור איתנו קשר עד השעה ${deadlineStr}.
            </p>
            <p style="color: #d97706; font-size: 0.9rem; margin-top: 5px;">
              לאחר שעה זו, האופציה תשתחרר אוטומטית והתאריך יהיה פנוי ללקוח הבא.
            </p>
          </div>

          <p style="font-size: 1rem; margin-bottom: 30px;">
            נשמח לחגוג איתכם!<br/>
            <strong>צוות מייפל - גן אירועים בעיר</strong><br/>
            טלפון: 03-6777772
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'logo.png',
        path: './src/assets/logo.png', // הנתיב ללוגו (צריך לוודא שהוא אכן שם)
        cid: 'mapleLogo' // הקישוריות שמאפשרת להציג את התמונה בתוך ה-HTML למעלה
      }
    ]
  };

  try {
    // 💡 כרגע אנחנו רק מדפיסים ללוג. כשתפתחי את המייל, נשחרר את ההערה משורת ה-sendMail.
    console.log(`[MAILER SIMULATION] מכין שליחת מייל ל: ${clientEmail}...`);
    console.log(mailOptions.subject);
    
    // await transporter.sendMail(mailOptions); // <--- זה הקוד שישלח את המייל באמת
    
    console.log(`[MAILER SIMULATION] ✅ המייל נשלח בהצלחה ל-${clientName}!`);
    return true;
  } catch (error) {
    console.error('שגיאה בשליחת המייל:', error);
    return false;
  }
};