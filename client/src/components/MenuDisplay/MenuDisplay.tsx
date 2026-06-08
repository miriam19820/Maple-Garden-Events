import React from 'react';
import styles from './MenuDisplay.module.css';
import { menuData } from '../../data/menuData';


const MenuDisplay = () => {
  return (
    <div className={styles.menuWrapper}>
      {/* לוגו כותרת עליונה */}
      <div className={styles.header}>
        <div className={styles.logoContainer}>
          <img src="/logo.png" alt="Maple Logo" className={styles.menuLogo} />
        </div>
        <h2 className={styles.mainTitle}>התפריט שלנו</h2>
        <div className={styles.accentLine}></div>
      </div>
{/* כפתור חזרה לפרטי ההזמנה */}
      <div style={{ padding: '20px', textAlign: 'left' }}>
        <button 
          onClick={() => window.close()} 
          style={{ 
            background: '#e2e8f0', color: '#334155', border: '1px solid #cbd5e1', 
            borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', 
            fontWeight: 'bold', fontSize: '1rem', transition: '0.2s'
          }}
        >
          ✖ סגירת התפריט וחזרה לפרטי ההזמנה
        </button>
      </div>
      {/* תוכן התפריט - פריסה לשתי עמודות במסכים רחבים */}
      <div className={styles.menuContent}>
        {menuData.map((section, index) => (
          <div key={index} className={styles.sectionBlock}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>{section.category}</h3>
              {section.subtitle && <p className={styles.sectionSubtitle}>{section.subtitle}</p>}
            </div>

            <div className={styles.subCategoriesWrapper}>
              {section.subCategories.map((sub, subIdx) => (
                <div key={subIdx} className={styles.subCategoryGroup}>
                  {sub.name && <h4 className={styles.subCategoryName}>{sub.name}</h4>}
                  <ul className={styles.itemsList}>
                    {sub.items.map((item, itemIdx) => (
                      <li key={itemIdx} className={styles.itemRow}>
                        <span className={styles.bullet}>♦</span>
                        <p className={styles.itemText}>{item.name}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* כותרת תחתונה קבועה מילה במילה מהדפים */}
      <div className={styles.footer}>
        <p className={styles.footerInfo}>רח' מודיעין 18, א.ת. סגולה, פ"ת / טל. 03-6777772 / www.maple-g.co.il</p>
        <p className={styles.footerNote}>אין להכניס לאולם מאכלים ומשקאות ללא אישור 24 שעות מראש עם משגיח הכשרות של האולם</p> {/*[cite: 1] */}
      </div>
    </div>
  );
};

export default MenuDisplay;