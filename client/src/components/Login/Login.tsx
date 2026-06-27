import React, { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { API_BASE } from '../../config/api';
import './Login.css';

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [error, setError] = useState('');

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError('לא התקבל טוקן מגוגל');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onLoginSuccess();
      } else {
        setError(data.message || 'אין הרשאת גישה למערכת');
      }
    } catch {
      setError('שגיאת תקשורת מול השרת - ודא שהוא פועל');
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <div className="login-brand">
          <img src="/logo.png" alt="מייפל אירועים" className="login-logo" />
          <h2>כניסת מנהל</h2>
          <p className="login-subtitle">גן אירועים מייפל — מערכת ניהול</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="login-google-wrap">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('שגיאה בטעינת ממשק גוגל')}
            theme="outline"
            size="large"
            text="signin_with"
            shape="rectangular"
          />
        </div>
      </div>
    </div>
  );
};
