// ---------------------------------------------------------------------------
// Coach Tools > Resources -- Nathan: "I should have the option to Print the
// Playbook, Print the Play Sheet... where you have the option to print
// everything." Just the three print actions; Stats entry and the
// leaderboard now live in their own tab (js/coachtools-stats.js) since
// Nathan asked for Stats and Schedule/print tools to be independent
// sections rather than one long list.
// ---------------------------------------------------------------------------
(function () {

  function wirePrintButtons() {
    const playbookBtn = document.getElementById('coachPrintPlaybookBtn');
    if (playbookBtn && !playbookBtn.dataset.wired) {
      playbookBtn.dataset.wired = '1';
      const originalLabel = playbookBtn.textContent;
      playbookBtn.addEventListener('click', async () => {
        if (playbookBtn.disabled || !window.generatePlaybookPDF) return;
        playbookBtn.disabled = true;
        try {
          const doc = await window.generatePlaybookPDF((done, total) => {
            playbookBtn.textContent = `📘 Generating… ${done}/${total}`;
          });
          doc.save('ASL_Bengals_Sideline_Playbook.pdf');
          playbookBtn.textContent = '✅ Saved!';
        } catch (err) {
          console.error('Playbook PDF generation failed:', err);
          playbookBtn.textContent = '⚠️ Failed — tap to retry';
        } finally {
          setTimeout(() => { playbookBtn.textContent = originalLabel; playbookBtn.disabled = false; }, 2200);
        }
      });
    }

    const callSheetBtn = document.getElementById('coachPrintCallSheetBtn');
    if (callSheetBtn && !callSheetBtn.dataset.wired) {
      callSheetBtn.dataset.wired = '1';
      const originalLabel = callSheetBtn.textContent;
      callSheetBtn.addEventListener('click', async () => {
        if (callSheetBtn.disabled || !window.generateCallSheetPDF) return;
        callSheetBtn.disabled = true;
        callSheetBtn.textContent = '📋 Generating…';
        try {
          const doc = await window.generateCallSheetPDF();
          doc.save('ASL_Bengals_Play_Sheet.pdf');
          callSheetBtn.textContent = '✅ Saved!';
        } catch (err) {
          console.error('Call sheet PDF generation failed:', err);
          callSheetBtn.textContent = '⚠️ Failed — tap to retry';
        } finally {
          setTimeout(() => { callSheetBtn.textContent = originalLabel; callSheetBtn.disabled = false; }, 2200);
        }
      });
    }

    const blankStatsBtn = document.getElementById('coachPrintBlankStatsBtn');
    if (blankStatsBtn && !blankStatsBtn.dataset.wired) {
      blankStatsBtn.dataset.wired = '1';
      blankStatsBtn.addEventListener('click', () => {
        if (!window.generateGameStatSheetPDF) return;
        const doc = window.generateGameStatSheetPDF(null);
        doc.save('ASL_Bengals_Stat_Sheet_Blank.pdf');
      });
    }
  }

  window.initCoachToolsPrint = function () {
    wirePrintButtons();
  };
})();
