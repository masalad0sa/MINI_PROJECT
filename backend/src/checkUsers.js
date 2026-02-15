
import mongoose from "mongoose";
import User from "./models/User.js";
import dotenv from "dotenv";

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/exam-proctoring")
  .then(async () => {
    try {
      const user = await User.findOne();
      if (user) {
        console.log("USER_ID:" + user._id.toString());
      } else {
        console.log("NO_USER_FOUND");
      }
    } catch (e) {
      console.error(e);
    } finally {
      mongoose.disconnect();
    }
  });
