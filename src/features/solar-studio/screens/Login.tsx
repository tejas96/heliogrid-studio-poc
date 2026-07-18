import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Sun } from 'lucide-react';
import { useStore } from '../store/store';
import { navigate } from '../router';

// Mock two-step phone login (matches reference flow; any password works).
export function Login() {
  const { dispatch } = useStore();
  const [phase, setPhase] = useState<'phone' | 'password'>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const phoneOk = /^\d{10}$/.test(phone);

  function login() {
    dispatch({
      type: 'login',
      user: { phone, companyName: 'helio grid', language: 'en', units: 'metric' },
    });
    navigate('/projects');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <Sun size={28} color="var(--brand)" />
        </div>
        <h1 style={{ fontSize: 34, margin: '0 0 6px', textAlign: 'center' }}>
          {phase === 'phone' ? 'Welcome' : 'Welcome Back'}
        </h1>
        <p style={{ color: 'var(--ink-3)', marginTop: 0, textAlign: 'center' }}>
          {phase === 'phone'
            ? 'Enter your phone number to continue'
            : `Enter your password for ${phone}`}
        </p>

        {phase === 'phone' ? (
          <>
            <div className="field" style={{ marginTop: 28 }}>
              <label>Phone Number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 12px',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  +91{' '}
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: 0.5 }}>
                    IN
                  </span>
                </span>
                <input
                  style={{ flex: 1 }}
                  placeholder="9876543210"
                  inputMode="numeric"
                  maxLength={10}
                  aria-label="Phone number"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, ''))
                  }
                  onKeyDown={(e) =>
                    e.key === 'Enter' && phoneOk && setPhase('password')
                  }
                />
              </div>
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={!phoneOk}
              onClick={() => setPhase('password')}
            >
              Continue <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="field" style={{ marginTop: 28 }}>
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ width: '100%', paddingRight: 40 }}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter your password"
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && password.length > 0 && login()
                  }
                  autoFocus
                />
                <button
                  onClick={() => setShowPw((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    color: 'var(--ink-3)',
                  }}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  data-tip={showPw ? 'Hide password' : 'Show password'}
                  data-tip-left=""
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="hint">
                Mock login — any password works in this POC.
              </span>
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={password.length === 0}
              onClick={login}
            >
              Login
            </button>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 18,
                fontSize: 13.5,
              }}
            >
              <button className="btn-ghost" onClick={() => setPhase('phone')}>
                Back
              </button>
              <button className="btn-ghost">Forgot password?</button>
            </div>
          </>
        )}
      </div>
      <div
        style={{
          position: 'fixed',
          bottom: 22,
          fontSize: 12,
          color: 'var(--ink-3)',
        }}
      >
        Solar Design Studio POC
      </div>
    </div>
  );
}
