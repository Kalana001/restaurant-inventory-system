import React, { useState, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { KeyRound, Mail, AlertCircle, ShieldAlert, Eye, EyeOff } from 'lucide-react';

// --- Rate limiter (client-side) ---
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function getRateLimitData() {
  try {
    const raw = sessionStorage.getItem('_login_rl');
    if (!raw) return { attempts: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch { return { attempts: 0, lockedUntil: null }; }
}

function saveRateLimitData(data: { attempts: number; lockedUntil: number | null }) {
  sessionStorage.setItem('_login_rl', JSON.stringify(data));
}

function resetRateLimit() {
  sessionStorage.removeItem('_login_rl');
}

// --- Password strength helper ---
function getPasswordStrength(pwd: string) {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score, label: 'Very Weak', color: 'bg-red-500' };
  if (score === 2) return { score, label: 'Weak', color: 'bg-orange-500' };
  if (score === 3) return { score, label: 'Fair', color: 'bg-yellow-500' };
  if (score === 4) return { score, label: 'Strong', color: 'bg-blue-500' };
  return { score, label: 'Very Strong', color: 'bg-green-500' };
}

export const Login: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  // Honeypot field — bots fill this, humans don't see it
  const honeypotRef = useRef<HTMLInputElement>(null);

  if (user) return <Navigate to="/" replace />;

  const strength = getPasswordStrength(password);

  const getLockoutRemaining = () => {
    if (!lockedUntil) return '';
    const ms = lockedUntil - Date.now();
    if (ms <= 0) return '';
    const mins = Math.ceil(ms / 60000);
    return `${mins} minute${mins > 1 ? 's' : ''}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Honeypot check — if filled, silently block
    if (honeypotRef.current?.value) {
      return;
    }

    // Rate limit check
    const rl = getRateLimitData();
    if (rl.lockedUntil && Date.now() < rl.lockedUntil) {
      setLockedUntil(rl.lockedUntil);
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        // Increment attempt counter
        const newAttempts = rl.attempts + 1;
        const newLocked = newAttempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
        saveRateLimitData({ attempts: newAttempts, lockedUntil: newLocked });
        if (newLocked) setLockedUntil(newLocked);
        throw new Error(authError.message);
      }

      // Success — clear rate limit
      resetRateLimit();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockedUntil != null && Date.now() < lockedUntil;
  const rl = getRateLimitData();
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - rl.attempts);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 gradient-bg">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/logo.png" alt="Sigiri Logo" className="w-20 h-20 rounded-full object-cover shadow-lg shadow-green-500/20" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-800 tracking-tight">
          Sigiri Catering &amp; Food Centre
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500 font-medium">
          Inventory Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-100 sm:px-10 card-shadow">

          {/* Lockout banner */}
          {isLocked && (
            <div className="mb-4 bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-xl flex items-start space-x-3">
              <ShieldAlert className="text-orange-500 shrink-0 mt-0.5" size={18} />
              <div className="text-xs font-medium text-orange-700">
                Too many failed attempts. Please wait <strong>{getLockoutRemaining()}</strong> before trying again.
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && !isLocked && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <div className="text-xs font-medium text-red-700">{error}</div>
                {rl.attempts > 0 && rl.attempts < MAX_ATTEMPTS && (
                  <div className="text-xs text-red-500 mt-1">{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before temporary lockout.</div>
                )}
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleLogin} noValidate>

            {/* Honeypot — hidden from real users, catches bots */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <input
                ref={honeypotRef}
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-semibold text-slate-700">
                Email Address
              </label>
              <div className="mt-1.5 relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail size={18} />
                </div>
                <input
                  id="login-email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@restaurant.com"
                  disabled={isLocked || loading}
                  className="block w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="mt-1.5 relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound size={18} />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  maxLength={128}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLocked || loading}
                  className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.score ? strength.color : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Password strength: <span className="font-semibold">{strength.label}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <div>
              <button
                type="submit"
                disabled={loading || isLocked}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-primary hover:bg-opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
