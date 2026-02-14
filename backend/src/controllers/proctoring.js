
import axios from 'axios';

// Environment variable for Python Service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

export const processFrame = async (req, res) => {
  try {
    const { id: examId } = req.params;
    const { image } = req.body;

    console.log(`[Proctoring] Received frame for exam ${examId}`); // DEBUG LOG

    if (!image) {
      console.error('[Proctoring] No image data received');
      return res.status(400).json({ message: 'Image data is required' });
    }

    // Verify exam exists (optional, but good practice)
    // const exam = await Exam.findById(examId);
    // if (!exam) {
    //   return res.status(404).json({ message: 'Exam not found' });
    // }

    // Forward to Python Service
    try {
      const response = await axios.post(`${PYTHON_SERVICE_URL}/process_frame`, {
        image
      });

      const analysisResult = response.data;

      // TODO: Implement Logic to store high-risk events in DB 
      // based on analysisResult.risk_level or suspicion_score

      // Return analysis to frontend
      res.json(analysisResult);

    } catch (pythonError) {
      console.error('Python Service Error:', pythonError.message);
      // Fallback or Error response
      res.status(503).json({ message: 'AI Proctoring Service unavailable', error: pythonError.message });
    }

  } catch (error) {
    console.error('Frame Processing Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
