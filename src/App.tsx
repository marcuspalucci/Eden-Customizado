import React, { lazy, Suspense, useEffect, useState } from 'react';
import { TabView, RightPanelTab } from './types';
import { useAppOrchestrator } from './hooks/useAppOrchestrator';
import { FeatureErrorBoundary } from './components/common/FeatureErrorBoundary';
import { AdminPanel } from './components/admin/AdminPanel';

const ReadingView    = lazy(() => import('./components/views/ReadingView').then(m => ({ default: m.ReadingView })));
const DevotionalView = lazy(() => import('./components/views/DevotionalView').then(m => ({ default: m.DevotionalView })));
const LocationsView  = lazy(() => import('./components/views/LocationsView').then(m => ({ default: m.LocationsView })));
const InterlinearView = lazy(() => import('./components/views/InterlinearView').then(m => ({ default: m.InterlinearView })));
const AnalysisView   = lazy(() => import('./components/views/AnalysisView').then(m => ({ default: m.AnalysisView })));
const ExegesisView   = lazy(() => import('./components/views/ExegesisView').then(m => ({ default: m.ExegesisView })));
const RightPanel     = lazy(() => import('./components/layout/RightPanel').then(m => ({ default: m.RightPanel })));
const ProfileModal   = lazy(() => import('./components/auth/ProfileModal').then(m => ({ default: m.ProfileModal })));
const AuthScreen     = lazy(() => import('./components/auth/AuthScreen').then(m => ({ default: m.AuthScreen })));
const CompleteProfileScreen = lazy(() => import('./components/auth/CompleteProfileScreen').then(m => ({ default: m.CompleteProfileScreen })));
const ConnectKeyScreen = lazy(() => import('./components/auth/ConnectKeyScreen').then(m => ({ default: m.ConnectKeyScreen })));
const MainLayout     = lazy(() => import('./components/layout/MainLayout').then(m => ({ default: m.MainLayout })));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-12">
    <i className="fas fa-circle-notch fa-spin text-2xl text-bible-accent"></i>
  </div>
);

export const App: React.FC = () => {
  const o = useAppOrchestrator();
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Selection menu listener
  useEffect(() => {
    document.addEventListener('mouseup', o.notes.handleTextSelection as EventListener);
    return () => document.removeEventListener('mouseup', o.notes.handleTextSelection as EventListener);
  }, [o.notes.handleTextSelection]);

  // ── Auth gates ─────────────────────────────────────────────────────────────
  if (o.loadingAuth) {
    return (
      <div className="min-h-screen bg-layer-1 flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-circle-notch fa-spin text-4xl text-bible-accent mb-4"></i>
          <p className="text-bible-text-light font-medium">Sincronizando perfil...</p>
        </div>
      </div>
    );
  }

  if (!o.user) return <Suspense fallback={null}><AuthScreen /></Suspense>;
  if (o.user.age === 0) return <Suspense fallback={null}><CompleteProfileScreen /></Suspense>;
  if (!o.apiKeyReady)
    return (
      <Suspense fallback={null}>
        <ConnectKeyScreen onConnect={() => { o.setApiKeyReady(true); o.refetch(); }} />
      </Suspense>
    );

  const bookChapter = `${o.bibleRef.book} ${o.bibleRef.chapter}`;
  const isFeaturePanel = o.activeTab !== TabView.READING && o.activeTab !== TabView.LIBRARY;

  return (
    <div className="contents">
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
      <Suspense fallback={<LoadingSpinner />}>
        <MainLayout
          activeTab={o.activeTab}
          onTabChange={o.handleTabChange}
          t={o.t}
          onOpenProfile={() => o.setShowProfileModal(true)}
          onOpenAdmin={() => setShowAdminPanel(true)}
          searchQuery={o.searchQuery}
          onSearchChange={o.setSearchQuery}
          onSearch={o.performSearch}
          loadingSearch={o.loading.search}
          onOpenRightPanel={() => o.setIsRightPanelOpen(!o.isRightPanelOpen)}
          isRightPanelOpen={o.isRightPanelOpen}
          compareMode={o.compareMode}
          onToggleCompare={() => { o.setIsCrossReference(false); o.setCompareMode(!o.compareMode); }}
        >
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            <div className="flex-1 flex overflow-hidden relative">

              {/* Reading pane (always mounted) */}
              <div
                className={`h-full overflow-y-auto p-4 md:p-8 transition-all duration-300 relative text-bible-text flex-1 min-w-0
                  ${isFeaturePanel ? 'hidden md:block md:w-1/2 md:border-r border-bible-border flex-none' : 'w-full'}
                  ${o.compareMode ? 'w-1/2 border-r border-bible-border flex-none' : ''}`}
              >
                <ReadingView
                  bibleText={o.bibleText}
                  secondaryBibleText={o.secondaryBibleText}
                  loading={o.loadingText}
                  t={o.t}
                  onParallelClick={o.handleParallelClick}
                  onStrongClick={o.bibleRef.translation.includes('Strong') ? o.handleStrongClick : undefined}
                  isSidePanelOpen={isFeaturePanel}
                />
              </div>

              {/* Feature panel */}
              {isFeaturePanel && (
                <div className="w-full md:w-1/2 bg-bible-paper border-l border-bible-border flex flex-col h-full">
                  <div className="p-4 border-b border-bible-border flex justify-between">
                    <h2 className="font-bold">
                      {o.activeTab === TabView.LOCATIONS   ? o.t('maps')
                      : o.activeTab === TabView.THEOLOGY   ? o.t('theology')
                      : o.activeTab === TabView.EXEGESIS   ? o.t('exegesis')
                      : o.activeTab === TabView.INTERLINEAR ? o.t('interlinear')
                      : o.activeTab === TabView.DEVOTIONALS ? o.t('devotionals')
                      : o.t('visuals')}
                    </h2>
                    <button onClick={() => o.handleTabChange(TabView.READING)}>
                      <i className="fas fa-times"></i>
                    </button>
                  </div>

                  <div className="h-full flex flex-col overflow-hidden">
                    {o.activeTab === TabView.DEVOTIONALS && (
                      <FeatureErrorBoundary featureName="Devocional" resetKey={bookChapter}>
                        <DevotionalView
                          loading={o.loading.devotional}
                          content={o.devotionalContent}
                          topic={o.devotionalTopic}
                          onTopicChange={o.setDevotionalTopic}
                          onGenerate={o.handleGenerateDevotional}
                          onGetDaily={o.handleGetDailyDevotional}
                          isGuest={o.isGuest}
                          error={o.featureError.devotional}
                        />
                      </FeatureErrorBoundary>
                    )}

                    {o.activeTab !== TabView.DEVOTIONALS && (
                      <div className="flex-1 overflow-y-auto p-6">
                        {o.activeTab === TabView.LOCATIONS && (
                          <FeatureErrorBoundary featureName="Locais" resetKey={bookChapter}>
                            <LocationsView
                              loading={o.loading.locations}
                              result={o.locationResult}
                              customQuery={o.customMapQuery}
                              onQueryChange={o.setCustomMapQuery}
                              onSearch={o.handleCustomMapGeneration}
                              onGenerate={o.handleGenerateLocations}
                              bookChapter={bookChapter}
                            />
                          </FeatureErrorBoundary>
                        )}
                        {o.activeTab === TabView.INTERLINEAR && (
                          <FeatureErrorBoundary featureName="Interlinear" resetKey={bookChapter}>
                            <InterlinearView
                              loading={o.loading.interlinear}
                              data={o.interlinearData}
                              onLoadMore={o.handleLoadMoreInterlinear}
                              onWordClick={o.handleWordClick}
                            />
                          </FeatureErrorBoundary>
                        )}
                        {o.activeTab === TabView.EXEGESIS && (
                          <FeatureErrorBoundary featureName="Exegese" resetKey={bookChapter}>
                            <ExegesisView
                              loading={o.loading.exegesis}
                              content={o.exegesisContent}
                              input={o.exegesisInput}
                              setInput={o.setExegesisInput}
                              onAnalyze={o.handleCustomExegesis}
                              onReset={o.handleResetExegesis}
                              onGenerate={o.handleGenerateExegesis}
                              bookChapter={bookChapter}
                            />
                          </FeatureErrorBoundary>
                        )}
                        {o.activeTab === TabView.THEOLOGY && (
                          <FeatureErrorBoundary featureName="Teologia" resetKey={bookChapter}>
                            <AnalysisView
                              loading={o.loading.theology}
                              content={o.theologyContent}
                              type="theology"
                              onGenerate={o.handleGenerateTheology}
                              bookChapter={bookChapter}
                            />
                          </FeatureErrorBoundary>
                        )}
                        {o.activeTab === TabView.STUDY_GUIDE && (
                          <FeatureErrorBoundary featureName="Guia de Estudo" resetKey={bookChapter}>
                            <AnalysisView
                              loading={o.loading.studyGuide}
                              content={o.studyGuideContent}
                              type="studyGuide"
                              onGenerate={o.handleGenerateStudyGuide}
                              bookChapter={bookChapter}
                            />
                          </FeatureErrorBoundary>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <RightPanel
              isOpen={o.isRightPanelOpen}
              onClose={() => o.setIsRightPanelOpen(false)}
              activeTab={o.activeRightTab}
              onTabChange={o.setActiveRightTab}
              t={o.t}
              searchResults={o.searchResults}
              onSearchResultClick={(ref) => { o.setBibleRef({ ...o.bibleRef, ...ref }); o.setIsRightPanelOpen(false); }}
              noteContent={o.notes.noteContent}
              onNoteChange={o.notes.handleNoteChange}
              onExportNotesTxt={o.notes.exportNotesTxt}
              onExportNotesPdf={o.notes.exportNotesPdf}
              isGuest={o.isGuest}
              selectedLexiconItem={o.selectedLexiconItem}
              loadingLexicon={o.loading.lexicon}
              restorePoints={o.restorePoints}
              loadingRestorePoints={o.loadingRestorePoints}
              onSaveRestorePoint={o.handleSaveRestorePoint}
              onDeleteRestorePoint={o.handleDeleteRestorePoint}
              onLoadRestorePoint={o.handleLoadRestorePoint}
              libraryAgentQuery={o.libraryAgentQuery}
              setLibraryAgentQuery={o.setLibraryAgentQuery}
              libraryAgentResponse={o.libraryAgentResponse}
              loadingLibraryAgent={o.loading.libraryAgent}
              onAskLibraryAgent={o.handleLibraryAgentAsk}
            />
          </div>
        </MainLayout>

        <ProfileModal isOpen={o.showProfileModal} onClose={() => o.setShowProfileModal(false)} />
      </Suspense>

      {/* Text selection floating menu */}
      {o.notes.showSelectionMenu && (
        <div
          className="fixed bg-layer-2 border border-bible-border shadow-xl rounded-lg p-1.5 flex gap-1 z-[70] animate-in fade-in zoom-in duration-200"
          style={{ left: o.notes.selectionPos.x, top: o.notes.selectionPos.y, transform: 'translate(-50%, -100%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const text = window.getSelection()?.toString() || o.notes.selectionText;
              if (text) {
                o.notes.addToNotes(text);
                o.setIsRightPanelOpen(true);
                o.setActiveRightTab(RightPanelTab.NOTES);
                o.notes.hideSelectionMenu();
                window.getSelection()?.removeAllRanges();
              }
            }}
            className="p-2 hover:bg-bible-secondary rounded text-bible-accent transition-colors"
            title="Adicionar à Nota"
          >
            <i className="fas fa-sticky-note"></i>
          </button>
          <div className="w-[1px] bg-bible-border mx-1"></div>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const text = window.getSelection()?.toString() || o.notes.selectionText;
              if (text) navigator.clipboard.writeText(text);
              o.notes.hideSelectionMenu();
            }}
            className="p-2 hover:bg-bible-secondary rounded text-bible-text-light transition-colors"
            title="Copiar"
          >
            <i className="fas fa-copy"></i>
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); o.notes.hideSelectionMenu(); }}
            className="p-2 hover:bg-red-50 rounded text-red-400 transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {o.fullScreenImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => o.setFullScreenImage(null)}
        >
          <img src={o.fullScreenImage} className="max-w-full max-h-full" alt="Full Screen" />
        </div>
      )}
    </div>
  );
};
