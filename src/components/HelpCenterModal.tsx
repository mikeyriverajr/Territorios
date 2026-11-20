import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Copy,
  FileText,
  HelpCircle,
  Lightbulb,
  Printer,
  Search,
  Share2,
  X,
} from 'lucide-react';
import {
  CONDUCTOR_WHATSAPP_GUIDE_TEXT,
  HELP_ARTICLES,
  HELP_CATEGORIES,
  HelpCategoryId,
  PUBLISHER_WHATSAPP_GUIDE_TEXT,
} from '../services/helpContent';
import {
  copyTextToClipboard,
  openWhatsAppShare,
} from '../services/notificationHelper';

interface HelpCenterModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialCategory?: HelpCategoryId;
  inline?: boolean;
  congregationName?: string;
}

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen = false,
  onClose,
  initialCategory = 'inicio_rapido',
  inline = false,
  congregationName,
}) => {
  const [activeCategory, setActiveCategory] =
    useState<HelpCategoryId>(initialCategory);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory, isOpen]);

  const normalizedQuery = useMemo(
    () =>
      searchQuery
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''),
    [searchQuery]
  );

  const visibleArticles = useMemo(() => {
    if (!normalizedQuery) {
      return HELP_ARTICLES.filter((a) => a.categoryId === activeCategory);
    }

    return HELP_ARTICLES.filter((a) => {
      const haystack = [
        a.title,
        a.summary,
        a.roleBadge,
        ...(a.steps || []),
        ...(a.tips || []),
        a.warning || '',
        ...a.keywords,
      ]
        .join(' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return haystack.includes(normalizedQuery);
    });
  }, [activeCategory, normalizedQuery]);

  const activeCategoryMeta = useMemo(
    () =>
      HELP_CATEGORIES.find((c) => c.id === activeCategory) ||
      HELP_CATEGORIES[0],
    [activeCategory]
  );

  const handleCopyGuide = async (text: string, label: string) => {
    await copyTextToClipboard(text);
    setCopyToast(`📋 ${label} copiada al portapapeles para pegar en WhatsApp`);
    setTimeout(() => setCopyToast(null), 3500);
  };

  if (!inline && !isOpen) return null;

  const content = (
    <div
      className={
        inline
          ? 'bg-white rounded-2xl border-2 border-slate-200 shadow-xs overflow-hidden'
          : 'bg-white rounded-3xl border-2 border-blue-900 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden'
      }
    >
      {/* Encabezado del Centro de Ayuda */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black text-base sm:text-xl leading-tight">
              Centro de Ayuda y Manual de Usuario
            </h2>
            <p className="text-xs text-blue-200">
              {congregationName
                ? `${congregationName} — Guías paso a paso por rol`
                : 'Guías completas paso a paso para Publicadores, Conductores y Administradores'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            title="Imprimir o guardar como PDF"
          >
            <Printer className="w-3.5 h-3.5 text-amber-300" />
            <span>Imprimir / PDF</span>
          </button>

          {!inline && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              aria-label="Cerrar centro de ayuda"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Cuerpo principal con scroll en modo modal */}
      <div
        className={
          inline
            ? 'p-4 sm:p-6 space-y-5'
            : 'p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 bg-slate-50'
        }
      >
        {/* Barra de acciones rápidas (Guías listas para WhatsApp) y Buscador */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          <div className="lg:col-span-6 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en la ayuda (ej. no visitar, kml, s-13, gps, pin)..."
              aria-label="Buscar en los manuales de ayuda"
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border-2 border-slate-300 bg-white focus:border-blue-600 focus:outline-none text-sm font-semibold text-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="lg:col-span-6 flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() =>
                handleCopyGuide(
                  PUBLISHER_WHATSAPP_GUIDE_TEXT,
                  'Guía de Publicadores'
                )
              }
              className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-amber-700" />
              <span>Copiar Guía Publicadores</span>
            </button>

            <button
              type="button"
              onClick={() => openWhatsAppShare(PUBLISHER_WHATSAPP_GUIDE_TEXT)}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp Publicadores</span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleCopyGuide(
                  CONDUCTOR_WHATSAPP_GUIDE_TEXT,
                  'Guía de Conductores'
                )
              }
              className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-950 border border-blue-300 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-blue-700" />
              <span>Copiar Guía Conductores</span>
            </button>
          </div>
        </div>

        {copyToast && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{copyToast}</span>
          </div>
        )}

        {/* Pestañas de Categorías */}
        <div className="flex flex-wrap gap-1.5 bg-white p-2 rounded-2xl border border-slate-200">
          {HELP_CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id && !normalizedQuery;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory(cat.id);
                }}
                className={`px-3 py-2 rounded-xl font-extrabold text-xs sm:text-sm cursor-pointer transition ${
                  active
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {cat.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Descripción de la sección actual o resultado de búsqueda */}
        <div className="bg-blue-50/90 border border-blue-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <HelpCircle className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-sm sm:text-base text-blue-950">
                {normalizedQuery
                  ? `Resultados para "${searchQuery.trim()}" (${visibleArticles.length})`
                  : activeCategoryMeta.label}
              </div>
              <p className="text-xs text-blue-900/90">
                {normalizedQuery
                  ? 'Mostrando artículos de todas las secciones que coinciden con tu búsqueda.'
                  : activeCategoryMeta.description}
              </p>
            </div>
          </div>
        </div>

        {/* Leyenda visual rápida del mapa en secciones de campo */}
        {!normalizedQuery &&
          (activeCategory === 'inicio_rapido' ||
            activeCategory === 'publicador' ||
            activeCategory === 'conductor') && (
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 space-y-2.5">
              <div className="text-xs font-black uppercase tracking-wider text-slate-600">
                Leyenda Visual del Mapa
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="px-2 py-0.5 rounded-full bg-blue-700 text-white font-black text-[11px] shrink-0">
                    1A
                  </span>
                  <span className="font-semibold text-slate-700">
                    Manzana pendiente (azul) / en progreso (ámbar)
                  </span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-black text-[11px] shrink-0">
                    1A ✓
                  </span>
                  <span className="font-semibold text-slate-700">
                    Manzana completada en este ciclo
                  </span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-black text-xs flex items-center justify-center shrink-0 border-2 border-white shadow-xs">
                    1
                  </span>
                  <span className="font-semibold text-slate-700">
                    Casa "No en casa" pendiente (ej. 1A-1)
                  </span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-red-50 border border-red-200">
                  <span className="w-6 h-6 rounded-full bg-red-600 text-white font-black text-xs flex items-center justify-center shrink-0 border-2 border-white shadow-xs">
                    !
                  </span>
                  <span className="font-bold text-red-900">
                    NO VISITAR (Permanente, no tocar)
                  </span>
                </div>
              </div>
            </div>
          )}

        {/* Lista de artículos de ayuda */}
        {visibleArticles.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center space-y-2">
            <div className="font-black text-slate-800 text-sm">
              No se encontraron guías para "{searchQuery}"
            </div>
            <p className="text-xs text-slate-500">
              Intente buscar palabras más generales como "mapa", "whatsapp",
              "kml", "pin" o "gps".
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-3.5 py-1.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 font-extrabold text-xs cursor-pointer"
            >
              Ver todas las guías
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleArticles.map((article) => (
              <article
                key={article.id}
                className="bg-white rounded-2xl border-2 border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-black text-base sm:text-lg text-slate-900">
                    {article.title}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-extrabold uppercase shrink-0">
                    {article.roleBadge}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                  {article.summary}
                </p>

                {article.steps && article.steps.length > 0 && (
                  <ol className="space-y-2 pt-1">
                    {article.steps.map((stepText, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                      >
                        <span className="w-5 h-5 rounded-full bg-blue-700 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{stepText}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {article.tips && article.tips.length > 0 && (
                  <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-3 space-y-1.5">
                    {article.tips.map((tip, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-xs text-amber-950"
                      >
                        <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                )}

                {article.warning && (
                  <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-start gap-2 text-xs text-red-950 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{article.warning}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Nota de referencia a los archivos Markdown completos */}
        <div className="bg-slate-100 border border-slate-300 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-slate-700">
          <FileText className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <strong>Documentación extendida del proyecto:</strong> Los manuales
            completos en formato Markdown están disponibles en{' '}
            <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
              README.md
            </code>{' '}
            y en la carpeta{' '}
            <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
              docs/
            </code>{' '}
            del repositorio (guías <code>01</code> a <code>06</code>).
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-[2000] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Centro de Ayuda y Manual de Usuario"
    >
      {content}
    </div>
  );
};
