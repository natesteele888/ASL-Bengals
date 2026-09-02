// ---------------------------------------------------------------------------
// Stat Keeper import -- Nathan: "I want to use the stats as they are written
// to write into the player profiles and attached to the game." Translates a
// Stat Keeper "Download Game Log" export (the raw play-by-play plays[], not
// the prototype's own pre-summed totals) into the exact statSheet shape
// js/game-stats-editor.js already knows how to read/render/save, mirroring
// the same per-play logic Stat Keeper's own compileStatSheet() uses (so a
// coach reviewing the imported numbers in the live editor sees the same
// totals Stat Keeper showed during the game).
//
// Player matching is by NAME against the LIVE team roster (js/roster.js),
// not the jersey number baked into Stat Keeper's roster snapshot -- numbers
// can change between when that snapshot was taken and today, but names are
// what a coach actually typed while logging plays. A name that doesn't
// match any live roster player is skipped for stat credit (not guessed at)
// and reported back as a warning, so a typo or nickname surfaces instead of
// a play silently vanishing into nothing.
//
// Wired into Coach Tools > Stats > Enter Stats (js/coachtools-stats.js),
// which REPLACES the selected game's statSheet with the result (confirmed
// choice) and drops the coach into the normal editor to review before Save
// -- this file never touches schedule.json itself.
// ---------------------------------------------------------------------------
(function () {

  function normName(s) {
    return String(s || '').trim().toLowerCase();
  }

  // Nathan: "The stats mistakenly have Jaiden L with the receiving yards.
  // Dean A had the 16 yards." Root cause: every statSheet row is keyed by
  // jersey NUMBER (see ensureAttemptRow below, and the live app's own
  // gamePlayerStats()) -- but several roster players have no number yet
  // (teamRoster.json legitimately allows a blank num), so two different
  // blank-number players collapse onto the exact same row and whichever
  // roster entry happens to come first "wins" the display name. numCounts
  // below detects any number (blank or real) shared by more than one
  // player, so numFor() can refuse to guess instead of silently crediting
  // the wrong kid.
  function buildNameIndex(liveRoster) {
    const byName = {};
    const numCounts = {};
    (liveRoster || []).forEach(p => {
      if (!p) return;
      const key = p.num === null || p.num === undefined ? '' : String(p.num);
      numCounts[key] = (numCounts[key] || 0) + 1;
    });
    (liveRoster || []).forEach(p => {
      if (p && p.name) byName[normName(p.name)] = p.num;
    });
    return { byName, numCounts };
  }

  // Same fixed field-position scale Stat Keeper uses: 0 = own goal line,
  // 100 = opponent's goal line.
  function absoluteSpot(side, yard) {
    if (side == null || yard === null || yard === undefined || yard === '') return null;
    const y = Number(yard);
    if (Number.isNaN(y)) return null;
    return side === 'OWN' ? y : (100 - y);
  }

  function asList(v) {
    return Array.isArray(v) ? v : (v ? [v] : []);
  }

  function translateStatKeeperExport(exportData, liveRoster) {
    const warnings = [];
    const nameIndex = buildNameIndex(liveRoster);
    function numFor(name) {
      if (!name) return null;
      const num = nameIndex.byName[normName(name)];
      if (num === undefined) {
        warnings.push('Couldn\'t match "' + name + '" to a player on the current roster -- that credit was skipped.');
        return null;
      }
      const key = num === null || num === undefined ? '' : String(num);
      if ((nameIndex.numCounts[key] || 0) > 1) {
        warnings.push('"' + name + '" shares jersey #' + (num || '(blank)') + ' with another player on the roster -- that credit was skipped to avoid mixing up their stats. Give them each a unique number to fix this for good.');
        return null;
      }
      return num;
    }

    const ss = window.blankGameStatSheet ? window.blankGameStatSheet() : {
      roster: [], rushing: [], passing: [], receiving: [], kickoffs: [], tackles: [], defExtra: [], turnovers: [],
      penalties: [], punts: [], puntReturns: [],
      scoring: { patGood: 0, patNoGood: 0, twoPtGood: 0, twoPtNoGood: 0, safety: 0 },
      penaltyTotals: { us: { count: 0, yds: 0 }, opponent: { count: 0, yds: 0 } },
      onside: { us: 0, opponent: 0 },
      oppPassing: { att: 0, comp: 0, yds: 0 },
      oppRushing: { att: 0, yds: 0, td: 0 },
      forcedPunts: 0,
    };
    ss.roster = (liveRoster || []).map(p => ({ num: p.num, name: p.name }));
    // Nathan: "the plays are coming up in alphabetical order instead of the
    // order in which they were called out in the game" -- ss.rushing/
    // .passing/.receiving are organized by PLAYER row, not by time, so
    // without a stamp on each attempt there's no way to later put a whole
    // game's offensive snaps back in true order when re-opening this game
    // in Stat Keeper (see its reconstructPlaysFromStatSheet/seqOf, and
    // game-stats-editor.js's commitAttempt which stamps this same way for
    // the manual entry screen). exportData.plays is newest-first (Stat
    // Keeper's insertPlay unshifts), so seq has to count up from the OLDEST
    // play, not forEach's own index order.
    const chronological = (exportData.plays || []).slice().reverse();
    const seqByPlay = new Map();
    chronological.forEach((p, i) => seqByPlay.set(p, i + 1));
    function playOrderExtra(p) {
      const extra = { seq: seqByPlay.get(p), spot: p.spot != null ? p.spot : null };
      // Nathan: "adding the play call to the plays we ran on offense" --
      // Stat Keeper's own PLAYBOOK picker stores a plain string, resolving
      // "Other / Not Sure" to its free-text field the same way Stat
      // Keeper's own playRunTxt() does for its on-screen play log.
      const callName = p.playCall === 'Other / Not Sure' ? (p.playCallOther || null) : (p.playCall || null);
      if (callName) extra.playCall = callName;
      return extra;
    }

    function ensureAttemptRow(sectionKey, num) {
      let row = ss[sectionKey].find(r => String(r.num) === String(num));
      if (!row) { row = { num: num, attempts: [] }; ss[sectionKey].push(row); }
      return row;
    }
    function ensureTackleRow(num) {
      let row = ss.tackles.find(r => String(r.num) === String(num));
      if (!row) { row = { num: num, marks: [] }; ss.tackles.push(row); }
      return row;
    }
    function ensureDefExtraRow(num) {
      let row = ss.defExtra.find(r => String(r.num) === String(num));
      if (!row) { row = { num: num, int: 0, pbu: 0, sacks: 0, fum: 0, td: false }; ss.defExtra.push(row); }
      return row;
    }
    function ensurePuntingRow(num) {
      let row = ss.punts.find(r => String(r.num) === String(num));
      if (!row) { row = { num: num, punts: 0, touchback: 0, fairCatch: 0, downed: 0, returned: 0, muffed: 0, netYds: 0, grossYds: 0 }; ss.punts.push(row); }
      return row;
    }
    function ensurePuntReturnRow(num) {
      let row = ss.puntReturns.find(r => String(r.num) === String(num));
      if (!row) { row = { num: num, ret: 0, yds: 0, td: 0 }; ss.puntReturns.push(row); }
      return row;
    }

    (exportData.plays || []).forEach(p => {
      if (!p || p.type === 'quarterEnd') return;

      if (p.type === 'run') {
        if (p.runTeam !== 'Opponent') {
          if (p.carrier) {
            const num = numFor(p.carrier);
            if (num != null) {
              ensureAttemptRow('rushing', num).attempts.push(Object.assign({ yds: Number(p.yards) || 0, fd: !!p.firstDown, dir: p.dir || null, td: !!p.td }, playOrderExtra(p)));
            }
          }
        } else {
          // Nathan: "I need to add the details for the other teams so we
          // know yardage on plays" -- opponent runs only ever carry a name
          // in the optional "Opponent Ball Carrier" field (p.oppCarrier),
          // not p.carrier, and there's no live-roster row to credit it to
          // anyway (they're not on our roster) -- so this is tracked as a
          // straight team total, same as oppPassing right below.
          ss.oppRushing.att += 1;
          ss.oppRushing.yds += Number(p.yards) || 0;
          if (p.td) ss.oppRushing.td += 1;
        }
      }

      if (p.type === 'pass') {
        const isUsPass = p.passTeam !== 'Opponent';
        if (isUsPass) {
          if (p.passer) {
            const num = numFor(p.passer);
            if (num != null) {
              ensureAttemptRow('passing', num).attempts.push(Object.assign({ yds: p.result === 'Complete' ? (Number(p.yards) || 0) : 0, comp: p.result === 'Complete', fd: !!p.firstDown, td: !!p.td }, playOrderExtra(p)));
            }
          }
          if (p.result === 'Complete' && p.target) {
            const num = numFor(p.target);
            if (num != null) {
              ensureAttemptRow('receiving', num).attempts.push(Object.assign({ yds: Number(p.yards) || 0, fd: !!p.firstDown, td: !!p.td }, playOrderExtra(p)));
            }
          }
        } else {
          ss.oppPassing.att += 1;
          if (p.result === 'Complete') { ss.oppPassing.comp += 1; ss.oppPassing.yds += Number(p.yards) || 0; }
        }
        if (p.result !== 'Complete' && p.incReason === 'Broken Up' && p.pbuBy) {
          const num = numFor(p.pbuBy);
          if (num != null) ensureDefExtraRow(num).pbu += 1;
        }
      }

      if (p.type === 'kick') {
        // Nathan: "add kicking/receiving team + spotting" -- kickoffs no
        // longer carry a flat returner/yards pair for the non-onside case,
        // they carry real Kicked From/Caught/Brought To spots (same shape
        // punt already used above), plus a kickTeam so a kick THE OPPONENT
        // made can be told apart from one WE made. Onside kicks are
        // untouched (still returner/yards when recovered by us).
        const isUsKick = p.kickTeam !== 'Opponent';
        if (p.onside) {
          if (p.recoveredByTeam === 'Opponent') ss.onside.opponent += 1; else ss.onside.us += 1;
          if (p.recoveredByTeam === 'Us' && p.returner) {
            const num = numFor(p.returner);
            if (num != null) ensureAttemptRow('kickoffs', num).attempts.push({ yds: Number(p.yards) || 0, td: !!p.td });
          }
        } else if (!isUsKick && p.returner) {
          // Opponent kicked, WE returned it -- a real named player, credited
          // the same way a punt return against us credits our returner.
          const num = numFor(p.returner);
          if (num != null) {
            const catchAbs = absoluteSpot(p.catchSide, p.catchYard);
            const endAbs = absoluteSpot(p.endSide, p.endYard);
            const retYds = (catchAbs != null && endAbs != null) ? (endAbs - catchAbs) : 0;
            ensureAttemptRow('kickoffs', num).attempts.push({ yds: retYds, td: !!p.td });
          }
        }
        // We-kicked-opponent-returned has no named opponent player to credit
        // (same as forcedPunts not naming an opponent punter) -- nothing
        // further to push into this box-score shape for that case.
      }

      if (p.type === 'punt') {
        const isUs = p.puntTeam !== 'Opponent';
        const startAbs = absoluteSpot(p.startSide, p.startYard);
        const catchAbs = absoluteSpot(p.catchSide, p.catchYard);
        const endAbs = absoluteSpot(p.endSide, p.endYard);
        if (!isUs) {
          ss.forcedPunts += 1;
          if (p.puntResult === 'Returned' && p.returner) {
            const num = numFor(p.returner);
            if (num != null) {
              const row = ensurePuntReturnRow(num);
              row.ret += 1;
              const retYds = (catchAbs != null && endAbs != null) ? (endAbs - catchAbs) : 0;
              row.yds += retYds;
              if (p.td) row.td += 1;
            }
          }
        } else if (p.punter) {
          const num = numFor(p.punter);
          if (num != null) {
            const row = ensurePuntingRow(num);
            row.punts += 1;
            if (p.puntResult === 'Touchback') row.touchback += 1;
            else if (p.puntResult === 'Fair Catch') row.fairCatch += 1;
            else if (p.puntResult === 'Downed') row.downed += 1;
            else if (p.puntResult === 'Returned') row.returned += 1;
            else if (p.puntResult === 'Muffed') row.muffed += 1;
            if (startAbs != null && endAbs != null) row.netYds += (endAbs - startAbs);
            if (startAbs != null && catchAbs != null) row.grossYds += (catchAbs - startAbs);
          }
        }
        // A punt return AGAINST us (isUs branch, opponent returning) still
        // credits our tackler -- same tackles table the dedicated Tackle
        // play type feeds.
        if (isUs && p.tackler) {
          const tNum = numFor(p.tackler);
          if (tNum != null) ensureTackleRow(tNum).marks.push('solo');
          asList(p.assist).forEach(name => {
            const aNum = numFor(name);
            if (aNum != null) ensureTackleRow(aNum).marks.push('assist');
          });
        }
      }

      if (p.type === 'tackle' && p.tackler) {
        const tNum = numFor(p.tackler);
        if (tNum != null) ensureTackleRow(tNum).marks.push('solo');
        asList(p.assist).forEach(name => {
          const aNum = numFor(name);
          if (aNum != null) ensureTackleRow(aNum).marks.push('assist');
        });
      }

      if (p.type === 'defextra' && p.player) {
        const num = numFor(p.player);
        if (num != null) {
          const row = ensureDefExtraRow(num);
          if (p.extraType === 'INT') row.int += 1;
          else if (p.extraType === 'PBU') row.pbu += 1;
          else if (p.extraType === 'Sack') row.sacks += 1;
          if (p.td) row.td = true;
        }
      }

      if (p.type === 'turnover') {
        ss.turnovers.push({
          desc: (p.toType || 'Turnover') + ' -- lost by ' + (p.lostBy || '?') +
            (p.recoveredBy ? ', recovered by ' + p.recoveredBy : '') + (p.td ? ' (TD return)' : '') +
            (p.note ? ' (' + p.note + ')' : ''),
        });
        // Nathan: "add fumbles recovered along with yards per carry."
        // Credits a structured, countable stat alongside the free-text
        // note above -- same "name a player, credit them" pattern already
        // used for pbuBy on a broken-up pass.
        if (p.toType === 'Fumble' && p.recoveredBy) {
          const num = numFor(p.recoveredBy);
          if (num != null) {
            const row = ensureDefExtraRow(num);
            row.fum += 1;
            if (p.td) row.td = true;
          }
        }
      }

      if (p.type === 'score') {
        if (p.scoreKind === 'PAT Good') ss.scoring.patGood += 1;
        else if (p.scoreKind === 'PAT No Good') ss.scoring.patNoGood += 1;
        else if (p.scoreKind === '2PT Good') ss.scoring.twoPtGood += 1;
        else if (p.scoreKind === '2PT No Good') ss.scoring.twoPtNoGood += 1;
        else if (p.scoreKind === 'Safety') ss.scoring.safety += 1;
        // 'Touchdown' score entries aren't stored separately here -- each
        // scoring play's own td flag (rushing/passing/receiving/kickoffs/
        // defExtra/puntReturns) already carries that, same as the editor.
      }

      if (p.type === 'penalty') {
        const teamKey = p.penTeam === 'Opponent' ? 'opponent' : 'us';
        const yds = Number(p.penYards) || 0;
        const num = p.penPlayer ? numFor(p.penPlayer) : null;
        ss.penalties.push({
          team: p.penTeam === 'Opponent' ? 'Opponent' : 'Us',
          type: (p.penType === 'Other' && p.penOther) ? p.penOther : (p.penType || 'Penalty'),
          yards: yds,
          num: num,
          declined: !!p.declined,
        });
        if (!p.declined) {
          ss.penaltyTotals[teamKey].count += 1;
          ss.penaltyTotals[teamKey].yds += yds;
        }
      }
    });

    return { statSheet: ss, warnings: warnings };
  }

  window.translateStatKeeperExport = translateStatKeeperExport;
})();
