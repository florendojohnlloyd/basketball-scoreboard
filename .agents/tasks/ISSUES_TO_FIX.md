# Issues to Fix - Basketball & Volleyball Player Stats

## Issue #1: Basketball - No Player List in SCORE Tab ❌

**Problem**: Kahit may roster na sa ROSTER tab, hindi nakikita ang players sa basketball SCORE tab.

**Root Cause**: Ang `ScoreTab.tsx` (basketball) ay walang player selection UI panels. Unlike volleyball na may HOME PLAYERS at AWAY PLAYERS panels, ang basketball ay wala completely.

**Files to Check**:
- `src/renderer/controlPanel/components/ScoreTab.tsx` - Basketball score tab (WALANG player panels)
- `src/renderer/controlPanel/components/VolleyballScoreTab.tsx` - Volleyball score tab (MAY player panels ✅)

**Solution Needed**:
Copy the player selection UI from VolleyballScoreTab.tsx to ScoreTab.tsx:
- Add Row with HOME PLAYERS / AWAY PLAYERS panels
- Add player selection (click to select)
- Add foul tracking buttons (+FOUL, -FOUL)
- Add stat buttons (+REB, +AST, +STL, +BLK) for basketball
- Show selected player in score buttons

**Basketball Stats Buttons Should Be**:
- +FOUL / -FOUL
- +REB (Rebound)
- +AST (Assist)  
- +STL (Steal)
- +BLK (Block)
- +FGA / +FGM (Field Goal Attempt / Make)

---

## Issue #2: Volleyball - Buttons Cut Off/Hidden ❌

**Problem**: Hindi kumpleto ang buttons sa volleyball score tab. May mga buttons na hindi nakikita or naka-cut off.

**Possible Causes**:
1. **Flex sizing issue** - Yung flex values sa rows ay sobrang liit or malaki
2. **Overflow hidden** - May `overflow: hidden` na nag-cut ng buttons
3. **Height constraints** - May fixed height na masyadong maliit
4. **Grid columns** - May 6 buttons pero 5 columns lang

**File to Fix**:
- `src/renderer/controlPanel/components/VolleyballScoreTab.tsx`

**Specific Areas to Check**:
1. **Row 2 (Player panels)**: `flex: 1.2` - baka masyadong malaki, nag-push down ng ibang rows
2. **Row 3 (Score controls)**: `flex: 1.0` - check if may enough space
3. **Row 4 (Action buttons)**: `gridTemplateColumns: 'repeat(6, 1fr)'` - 6 buttons ✅ correct

**Current Layout (Volleyball)**:
```
Sponsor Logo       - height: 52px (fixed)
Banner (scores)    - flexShrink: 0 (fixed)
Player Panels      - flex: 1.2 ← TOO LARGE?
Score Controls     - flex: 1.0
Timeouts           - flex: 1
Action Buttons     - flex: 0.9
Settings (details) - flexShrink: 0 (collapsible)
```

**Total Flex**: 1.2 + 1.0 + 1 + 0.9 = 4.1  
**Fixed heights**: ~52px (logo) + panels + settings

**Recommended Fix**:
Reduce player panel flex from 1.2 to 0.8:
```typescript
flex: 0.8  // instead of 1.2
```

This gives more space to other rows!

---

## Basketball vs Volleyball Comparison

| Feature | Basketball | Volleyball |
|---------|-----------|------------|
| Player List UI | ❌ Missing | ✅ Working |
| Player Selection | ❌ No | ✅ Yes |
| Individual Points | ❌ No | ✅ Yes |
| Foul Tracking | ❌ No UI | ✅ Yes |
| Stats Buttons | ❌ No | ✅ Yes (Block, Ace, Dig, Assist) |
| Box Score | ✅ Yes (PDF/Excel) | ✅ Yes (CSV) |

---

## Priority

### High Priority 🔥
1. **Fix volleyball button layout** (small fix, 5-10 min)
2. **Add basketball player panels** (copy from volleyball, 30-60 min)

### Testing Checklist
After fixes:
- [ ] Basketball: Players visible in SCORE tab
- [ ] Basketball: Click player to select
- [ ] Basketball: Stats buttons work (+REB, +AST, etc.)
- [ ] Volleyball: All buttons visible
- [ ] Volleyball: No scrolling needed on 1080p screen
- [ ] Both: Foul tracking works
- [ ] Both: Box score shows player stats

---

## Next Steps

1. **Fix volleyball layout first** (quick win)
2. **Add basketball player UI** (larger task)
3. **Test both sports** thoroughly
4. **Rebuild EXE**
5. **Upload to GitHub Release**
