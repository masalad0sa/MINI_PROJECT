import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error(err));

const getExaminer = async () => {
    try {
        const examiner = await User.findOne({ role: "examiner" });
        if (examiner) {
            console.log("EXAMINER_FOUND");
            console.log(JSON.stringify({ email: examiner.email, role: examiner.role }));
        } else {
            console.log("NO_EXAMINER_FOUND");
            // Create one
            const newExaminer = await User.create({
                name: "Test Examiner",
                email: "examiner@test.com",
                password: "password123",
                role: "examiner"
            });
            console.log("EXAMINER_CREATED");
            console.log(JSON.stringify({ email: newExaminer.email, role: newExaminer.role }));
        }
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
};

getExaminer();
