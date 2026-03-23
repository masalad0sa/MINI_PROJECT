import cv2
import mediapipe as mp


class FaceMeshDetector:
    def __init__(
        self,
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=bool(static_image_mode),
            max_num_faces=int(max_num_faces),
            refine_landmarks=bool(refine_landmarks),
            min_detection_confidence=float(min_detection_confidence),
            min_tracking_confidence=float(min_tracking_confidence),
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.draw_spec = self.mp_draw.DrawingSpec(thickness=1, circle_radius=1)

    def process(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return self.face_mesh.process(rgb)

    def draw_landmarks(self, frame, results):
        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:
                self.mp_draw.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=self.mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=self.draw_spec,
                    connection_drawing_spec=self.draw_spec,
                )
