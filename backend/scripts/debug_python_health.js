
import axios from 'axios';

async function checkPythonHealth() {
    try {
        console.log("Checking Python Service Health at http://localhost:8000/health...");
        const response = await axios.get('http://localhost:8000/health', { timeout: 2000 });
        console.log("Status:", response.status);
        console.log("Data:", response.data);
    } catch (error) {
        console.error("Python Service Unreachable:", error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log("Connection Refused - Server likely not running.");
        }
    }
}

checkPythonHealth();
