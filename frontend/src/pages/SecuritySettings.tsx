import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, ShieldCheck, ShieldOff, QrCode, KeyRound, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export const SecuritySettings: React.FC = () => {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const checkMfaStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = data?.totp?.find(f => f.status === 'verified');
      setMfaEnabled(!!verified);
      if (verified) setFactorId(verified.id);
    } catch (err: any) {
      console.error('MFA check error:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEnroll = async () => {
    setMessage(null);
    setEnrolling(true);
    setTotpCode('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Sigiri Catering' });
      if (error) throw error;
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      // Start a challenge immediately so we can verify
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (challengeErr) throw challengeErr;
      setChallengeId(challengeData.id);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to start MFA enrollment.' });
      setEnrolling(false);
    }
  };

  const verifyEnroll = async () => {
    if (!factorId || !challengeId || totpCode.length !== 6) return;
    setVerifying(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code: totpCode });
      if (error) throw error;
      setEnrolling(false);
      setQrCode(null);
      setSecret(null);
      setChallengeId(null);
      setMfaEnabled(true);
      setMessage({ type: 'success', text: 'MFA enabled successfully! Your account is now more secure.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Invalid code. Please try again.' });
    } finally {
      setVerifying(false);
    }
  };

  const cancelEnroll = async () => {
    if (factorId && !mfaEnabled) {
      await supabase.auth.mfa.unenroll({ factorId });
    }
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setChallengeId(null);
    setTotpCode('');
    setMessage(null);
  };

  const disableMfa = async () => {
    if (!factorId) return;
    if (!confirm('Are you sure you want to disable MFA? This will make your account less secure.')) return;
    setUnenrolling(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setMfaEnabled(false);
      setFactorId(null);
      setMessage({ type: 'success', text: 'MFA has been disabled.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to disable MFA.' });
    } finally {
      setUnenrolling(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Security Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your account security and two-factor authentication.</p>
      </div>

      {/* MFA Card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 card-shadow space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mfaEnabled ? 'bg-green-100' : 'bg-slate-100'}`}>
              {mfaEnabled ? <ShieldCheck size={20} className="text-green-600" /> : <Shield size={20} className="text-slate-400" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Two-Factor Authentication (MFA)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Use an authenticator app to add an extra layer of security.</p>
            </div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${mfaEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {mfaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Checking MFA status...
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`border-l-4 p-4 rounded-r-xl flex items-start gap-3 ${message.type === 'success' ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
            {message.type === 'success'
              ? <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-0.5" />
              : <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />}
            <p className={`text-xs font-medium ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>
          </div>
        )}

        {/* QR Code enrollment flow */}
        {enrolling && qrCode && (
          <div className="space-y-5">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 space-y-4">
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                <QrCode size={16} />
                Step 1: Scan with your authenticator app
              </h4>
              <p className="text-xs text-slate-500">Use <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app.</p>
              <div className="flex justify-center">
                <img src={qrCode} alt="MFA QR Code" className="w-48 h-48 border-4 border-white rounded-xl shadow-md" />
              </div>
              {secret && (
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Or enter this code manually:</p>
                  <code className="text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700 tracking-widest select-all">{secret}</code>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                <KeyRound size={16} />
                Step 2: Enter the 6-digit verification code
              </h4>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl font-mono tracking-[0.5em] text-slate-800"
              />
              <div className="flex gap-3">
                <button onClick={cancelEnroll} className="flex-1 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button
                  onClick={verifyEnroll}
                  disabled={totpCode.length !== 6 || verifying}
                  className="flex-1 px-4 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm disabled:opacity-60 hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  {verifying && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {verifying ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!loading && !enrolling && (
          <div className="flex gap-3">
            {!mfaEnabled ? (
              <button
                onClick={startEnroll}
                className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm hover:bg-opacity-90 transition-all shadow-sm flex items-center gap-2"
              >
                <ShieldCheck size={16} />
                Enable MFA
              </button>
            ) : (
              <button
                onClick={disableMfa}
                disabled={unenrolling}
                className="px-5 py-2.5 bg-white border border-red-200 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-50 transition-all flex items-center gap-2 disabled:opacity-60"
              >
                <ShieldOff size={16} />
                {unenrolling ? 'Disabling...' : 'Disable MFA'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecuritySettings;
