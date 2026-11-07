// ===== הגדרות החנות — זה הקובץ היחיד שצריך לערוך =====
window.STORE = {
  brand: "KLARO",

  // מזהה פיקסל של מטא (Events Manager → Data sources → Pixel ID). השאר ריק עד שיש.
  pixelId: "",

  // קישורי דפי תשלום מ-Grow — אחד לכל חבילה.
  // ב-Grow: יצירת דף תשלום → מוצר + מחיר → להוסיף שדות: כתובת למשלוח, עיר, טלפון.
  // כתובת הצלחה (Success URL) של כל דף: https://sccs1298.github.io/Sc-brower/thanks.html?p=1 (או p=2 / p=3)
  growLinks: {
    1: "",
    2: "",
    3: ""
  },

  // compare = מחיר אותה כמות ביחידות בודדות (79 ₪ ליח') — חיסכון אמיתי, לא מחיר "לפני" מומצא
  packages: {
    1: { title: "ערכה אחת", qty: 1, price: 79, compare: 0 },
    2: { title: "זוג ערכות", qty: 2, price: 119, compare: 158, badge: "הכי משתלם" },
    3: { title: "3 ערכות", qty: 3, price: 149, compare: 237 }
  },

  // מתנה לחבילות 2+ (רק אם הספק באמת שולח מטלית — אחרת למחוק את השורה)
  gift: "מטלית מיקרופייבר מתנה",

  // תמונות/סרטונים אמיתיים של המוצר (מהספק באישור, או שצילמת). לשים בתיקייה docs/media/
  // דוגמה: ["media/1.jpg", "media/2.jpg", "media/demo.mp4"]. כשהרשימה ריקה מוצג האיור.
  photos: ["media/product-zoom.mp4", "media/bundle.jpg", "media/apply.jpg", "media/rinse.jpg", "media/door-pocket.jpg"],

  // ביקורות אמיתיות בלבד. דוגמה:
  // { name: "יוסי מ.", city: "חיפה", stars: 5, text: "...", img: "reviews/yossi.jpg" }
  reviews: [],

  // ביקורות שהעתקת מדף המוצר ב-AliExpress — מוצגות בנפרד ועם מקור, לא כביקורות על KLARO.
  // דוגמה: { name: "D***n", country: "IL", stars: 5, text: "תרגום הביקורת לעברית" }
  marketplaceReviews: {
    source: "AliExpress",
    url: "https://www.aliexpress.com/item/1005007805619545.html",
    items: []
  },

  shippingText:"משלוח חינם עד הבית · 10–18 ימי עסקים",

  // פרטי העסק — חובה לפי חוק הגנת הצרכן (עסקת מכר מרחוק)
  business: {
    name: "",                  // שם העוסק
    id: "",                    // מספר עוסק פטור
    phone: "",                 // טלפון לשירות לקוחות
    whatsapp: "",              // מספר וואטסאפ בפורמט 9725XXXXXXXX
    email: "",                 // מייל לשירות לקוחות
    address: ""                // כתובת למשלוח החזרות
  }
};
