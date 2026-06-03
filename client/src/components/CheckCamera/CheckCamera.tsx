import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';

// אנחנו מגדירים שהקומפוננטה מקבלת פונקציה מהטופס האב
interface CheckCameraProps {
  onCapture: (imageSrc: string) => void;
}

const CheckCamera: React.FC<CheckCameraProps> = ({ onCapture }) => {
  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "environment" // 'environment' למצלמה אחורית (או מצלמת רשת במחשב)
  };

  const capture = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setCapturedImage(imageSrc);
        onCapture(imageSrc); // מעבירים את התמונה ל-EventFormManager!
      }
    }
  };

  return (
    <div style={{ textAlign: 'center', direction: 'rtl', background: '#f9f9f9', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
      {!capturedImage ? (
        <div>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            style={{ width: '100%', maxWidth: '400px', borderRadius: '8px' }}
          />
          <br />
          <button 
            type="button"
            onClick={capture}
            style={{ padding: '8px 16px', fontSize: '14px', marginTop: '10px', cursor: 'pointer', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            📸 צלם עכשיו
          </button>
        </div>
      ) : (
        <div>
          <img 
            src={capturedImage} 
            alt="צ'ק מצולם" 
            style={{ width: '100%', maxWidth: '400px', borderRadius: '8px', border: '2px solid #4CAF50' }} 
          />
          <br />
          <button 
            type="button"
            onClick={() => setCapturedImage(null)}
            style={{ padding: '8px 16px', fontSize: '14px', marginTop: '10px', cursor: 'pointer', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            🔄 צלם מחדש
          </button>
        </div>
      )}
    </div>
  );
};

export default CheckCamera;