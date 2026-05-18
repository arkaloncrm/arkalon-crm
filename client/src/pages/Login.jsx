import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

function LoginLogo() {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div className="flex items-center justify-center gap-2">
        <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center">
          <span className="text-white font-montserrat font-bold text-sm">A</span>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-montserrat font-bold text-white text-xl tracking-wide">ARKALON</span>
          <span className="font-opensans text-arkalon-lightblue text-xs uppercase tracking-widest">CRM</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src="/src/assets/logo.png"
      alt="Arkalon CRM"
      onError={() => setImgError(true)}
      className="h-10 w-auto object-contain mx-auto"
    />
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetMsg, setShowResetMsg] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-arkalon-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">

        {/* Navy header strip with logo */}
        <div className="bg-arkalon-navy px-8 py-6 flex items-center justify-center">
          <LoginLogo />
        </div>

        {/* White card body */}
        <div className="px-8 py-8">
          <div className="mb-6">
            <h1 className="font-montserrat font-bold text-arkalon-navy text-2xl mb-1">
              Sign in to Arkalon CRM
            </h1>
            <p className="text-arkalon-grey text-sm font-opensans">
              Stuart Munro · Arkalon Consulting
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-montserrat font-semibold text-slate-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="stuart@arkalon.com.au"
                className="w-full px-3 py-2.5 border border-arkalon-lightgrey rounded text-sm font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/40 focus:border-arkalon-blue transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-montserrat font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••"
                  className="w-full px-3 py-2.5 pr-10 border border-arkalon-lightgrey rounded text-sm font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/40 focus:border-arkalon-blue transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-arkalon-danger text-sm font-opensans bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-arkalon-blue text-white font-montserrat font-bold text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Password reset — no email flow; directs the user to the administrator */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowResetMsg(true)}
              className="text-sm text-arkalon-blue hover:underline font-opensans"
            >
              Forgot password?
            </button>
            {showResetMsg && (
              <p className="mt-2 text-xs text-arkalon-grey font-opensans">
                To reset your password, please contact your CRM administrator.
              </p>
            )}
          </div>
        </div>

        <div className="px-8 py-3 border-t border-arkalon-lightgrey text-center">
          <p className="text-[11px] text-slate-400 font-opensans">
            Arkalon CRM · Powered by Arkalon Consulting
          </p>
        </div>
      </div>
    </div>
  );
}
