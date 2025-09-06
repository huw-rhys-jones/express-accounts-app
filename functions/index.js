const functions = require("firebase-functions");
const nodemailer = require("nodemailer");
const cors = require("cors")({origin: true});

const GMAIL_USER = "janus.antithesis@gmail.com";
const GMAIL_PASS = "bchz bnwo pjhd qpzy";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  }, // ✅ Add trailing comma
});

exports.submitDeletionRequest = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {email, message} = req.body;

    const mailOptions = {
      from: GMAIL_USER,
      to: "info@caistec.com",
      subject: "New Data Deletion Request",
      text: `Email: ${email}\n\nMessage:\n${message || "(no message)"}`,
    }; // ✅ Add trailing comma

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending mail", error);
        return res.status(500).send("Failed to send request");
      }
      return res.status(200).send("Request received. We'll handle it shortly.");
    });
  });
});
