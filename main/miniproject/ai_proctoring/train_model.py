import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import accuracy_score, classification_report
import joblib

# Load your real data
data = pd.read_csv("exam_log.csv")

# Convert label
label_map = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
data["label"] = data["risk_level"].map(label_map)

# Handle boolean/string phone_detected and convert to integer (0 or 1)
data["phone_detected"] = data["phone_detected"].astype(int)

# Features
X = data[["angle", "face_count", "phone_detected"]]
y = data["label"]

# Train/test split and evaluate to show accuracy
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train model using GridSearchCV to ensure highest accuracy (Hyperparameter Tuning)
param_grid = {
    'n_estimators': [50, 100, 200],
    'max_depth': [None, 10, 20],
    'class_weight': ['balanced', None]
}

rf_base = RandomForestClassifier(random_state=42)
grid_search = GridSearchCV(estimator=rf_base, param_grid=param_grid, cv=3, n_jobs=-1, verbose=1)
grid_search.fit(X_train, y_train)

best_model = grid_search.best_estimator_

# Predict and Evaluate
y_pred = best_model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"✅ Model tuned and validated! Validation Accuracy: {accuracy * 100:.2f}%")
print("Classification Report:")
print(classification_report(y_test, y_pred))

# Train final model on ALL data for production
best_model.fit(X, y)

# Save model
joblib.dump(best_model, "model.pkl")

print("✅ Final Model trained on all data and saved to model.pkl!")