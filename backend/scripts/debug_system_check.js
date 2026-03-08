
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Minimal mock of a JPEG image (base64)
// This is just a valid base64 string header, not a real face, but enough to reach the decoder
const MOCK_IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RCYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP19fb3+Pn6/9oADAMBAAIRAxEAPwD9/KKKKAP/2Q==";

async function testSystemCheck() {
    try {
        console.log("Sending request to http://localhost:5000/api/proctoring/system-check/frame...");
        
        const response = await axios.post('http://localhost:5000/api/proctoring/system-check/frame', {
            image: MOCK_IMAGE,
            sessionId: "debug-session-123"
        });

        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(response.data, null, 2));

        if (response.data.success) {
            console.log("SUCCESS: System check endpoint is working.");
        } else {
            console.log("FAILURE: API returned success=false");
        }

    } catch (error) {
        console.error("ERROR:", error.message);
        if (error.response) {
            console.log("Response Data:", error.response.data);
        }
    }
}

testSystemCheck();
