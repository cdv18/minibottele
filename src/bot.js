const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// Đường dẫn tới file JSON của service account key
const serviceAccount = require('./minicheckhomebot-firebase-adminsdk-sxnao-c8e4b9c854.json');

// Khởi tạo Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
//   databaseURL: "https://<your-project-id>.firebaseio.com"  // URL Firebase Realtime Database (không bắt buộc với Firestore)
});

const db = admin.firestore();

// Khởi tạo bot
const bot = new TelegramBot('7664262872:AAHTCqz-yR-V9sApmrz2V1OW9xUFUQffjRs', {polling: true});

// Hàm để điểm danh
const checkIn = async (userId, userName, session) => {
  const today = new Date().toISOString().split('T')[0]; // Lấy ngày hiện tại (YYYY-MM-DD)
  try {
    const docRef = db.collection('attendance').doc(`${today}-${session}`);
    const doc = await docRef.get();

    if (!doc.exists) {
      await docRef.set({
        session,
        date: today,
        attendees: [{ userId, userName }],
      });
    } else {
      const data = doc.data();
      const attendees = data.attendees || [];
      const isCheckedIn = attendees.some(attendee => attendee.userId === userId);
      if (!isCheckedIn) {
        attendees.push({ userId, userName });
        await docRef.update({ attendees });
      }
    }
    return `Bạn đã điểm danh thành công cho buổi ${session === 'morning' ? 'sáng' : 'chiều'}!`;
  } catch (error) {
    console.error('Error checking in:', error);
    return 'Có lỗi xảy ra khi điểm danh. Vui lòng thử lại.';
  }
};

// Hàm thống kê điểm danh theo tháng
const getMonthlyReport = async (month, year) => {
  const startDate = new Date(`${year}-${month}-01`);
  const endDate = new Date(startDate);
  endDate.setMonth(startDate.getMonth() + 1);

  try {
    const morningQuery = await db.collection('attendance')
      .where('session', '==', 'morning')
      .where('date', '>=', startDate.toISOString().split('T')[0])
      .where('date', '<', endDate.toISOString().split('T')[0])
      .get();

    const afternoonQuery = await db.collection('attendance')
      .where('session', '==', 'afternoon')
      .where('date', '>=', startDate.toISOString().split('T')[0])
      .where('date', '<', endDate.toISOString().split('T')[0])
      .get();

    const morningCount = morningQuery.docs.reduce((acc, doc) => acc + (doc.data().attendees?.length || 0), 0);
    const afternoonCount = afternoonQuery.docs.reduce((acc, doc) => acc + (doc.data().attendees?.length || 0), 0);

    return `Thống kê điểm danh tháng ${month}/${year}:\n- Sáng: ${morningCount} người\n- Chiều: ${afternoonCount} người`;
  } catch (error) {
    console.error('Error generating report:', error);
    return 'Có lỗi xảy ra khi lấy thống kê. Vui lòng thử lại.';
  }
};

// Xử lý sự kiện tin nhắn từ người dùng
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Chào mừng! Bạn có thể điểm danh bằng cách gửi /checkin_sang hoặc /checkin_chieu.');
});

bot.onText(/\/checkin_sang/, async (msg) => {
  const response = await checkIn(msg.from.id, msg.from.username, 'morning');
  bot.sendMessage(msg.chat.id, response);
});

bot.onText(/\/checkin_chieu/, async (msg) => {
  const response = await checkIn(msg.from.id, msg.from.username, 'afternoon');
  bot.sendMessage(msg.chat.id, response);
});

bot.onText(/\/thongke (\d{2})\/(\d{4})/, async (msg, match) => {
  const month = match[1];
  const year = match[2];
  const report = await getMonthlyReport(month, year);
  bot.sendMessage(msg.chat.id, report);
});