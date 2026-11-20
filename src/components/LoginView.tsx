import React, { useState } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { ConductorUser } from '../types/territory';
import { TerriMapLogo } from './TerriMapLogo';

interface LoginViewProps {
  congregationName: string;
  adminPin: string;
  conductors: ConductorUser[];
  onLoginSuccess: (
    role: 'admin' | 'conductor',
    conductor?: ConductorUser
  ) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  congregationName,
  adminPin,
  conductors,
  onLoginSuccess,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(
    conductors[0]?.id || 'admin'
  );
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const effectiveSelectedId =
    conductors.length > 0
      ? conductors.some((c) => c.id === selectedUserId)
        ? selectedUserId
        : conductors[0].id
      : 'admin';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();

    if (effectiveSelectedId === 'admin') {
      if (cleanPin === adminPin) {
        setErrorMsg('');
        onLoginSuccess('admin');
      } else {
        setErrorMsg('PIN de Administrador incorrecto.');
      }
      return;
    }

    const conductor = conductors.find((c) => c.id === effectiveSelectedId);
    if (!conductor) {
      setErrorMsg('Seleccione un usuario válido.');
      return;
    }

    if (cleanPin === conductor.pin) {
      setErrorMsg('');
      onLoginSuccess('conductor', conductor);
    } else {
      setErrorMsg(`PIN incorrecto para ${conductor.name}.`);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-8 bg-slate-100">
      <div className="max-w-md w-full space-y-5">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border-2 border-slate-200 shadow-xl p-6 sm:p-8 space-y-5"
        >
          <div className="text-center space-y-2">
            <TerriMapLogo className="w-16 h-16 mx-auto drop-shadow-md" />
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Terri<span className="text-blue-700">Map</span>
              </h1>
              {congregationName && (
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mt-0.5">
                  {congregationName}
                </div>
              )}
            </div>
            <p className="text-sm text-slate-600">
              Seleccione su nombre e ingrese su PIN de acceso para entrar.
            </p>
          </div>

          {/* Selector de Nombre (Conductores; si tienen permisos de Admin pueden alternar vistas luego) */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
              1. ¿Quién ingresa?
            </label>
            <select
              value={effectiveSelectedId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setErrorMsg('');
              }}
              className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-700 focus:outline-none font-extrabold text-base text-slate-900 cursor-pointer"
            >
              {conductors.length > 0 ? (
                conductors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="admin">Administrador</option>
              )}
            </select>
          </div>

          {/* Campo de PIN */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
              2. PIN de Acceso:
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="w-full pl-11 pr-4 py-3.5 text-center text-2xl font-black tracking-[0.4em] rounded-xl border-2 border-slate-300 focus:border-blue-700 focus:outline-none"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-300 text-red-800 text-xs font-bold p-3 rounded-xl text-center">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-black text-base rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <LogIn className="w-5 h-5" />
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
};
