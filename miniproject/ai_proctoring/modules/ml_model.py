import pandas as pd
import joblib
import os

class MLModel:
    def __init__(self):
        # Load your trained model
        # Try to find model.pkl in the base directory
        model_path = os.path.join(os.path.dirname(__file__), '..', 'model.pkl')
        if os.path.exists(model_path):
            self.model = joblib.load(model_path)
        else:
            self.model = None

    def predict(self, angle, face_count, phone_detected):
        if self.model is None:
            # Fallback logic if no model is found
            score = 0
            if face_count > 1: return 2
            if phone_detected: return 2
            if abs(angle) > 20: score += 1
            if score > 0: return 1
            return 0
            
        feature_names = ["angle", "face_count", "phone_detected"]
        X_test = pd.DataFrame([[angle, face_count, int(phone_detected)]], columns=feature_names)
        prediction = self.model.predict(X_test)[0]
        return prediction