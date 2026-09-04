# Batch 1 — Header, Landing, Footer

Batch: 1
Pages reviewed: `/fa`, `/en`, public discovery shell at mobile and desktop
Pages changed: public shell and spatial landing
Design references used: supplied PET LIFE OS boards, user-provided Cookie photo, generated world based on the existing park composition
Runtime bugs found: ambiguous login button selector after mobile menu was added
Runtime bugs fixed: test now targets the login action explicitly
Visual mismatches fixed: primary navigation moved into one header; mobile navigation collapses into a sheet; active navigation state added; theme control is icon-based; written Cookie identity removed; cats, distinct functional buildings, prominent memories pavilion, mountains, Milad Tower and Azadi Tower added without city labels; compact footer added
Assets created: `petlife-city-day-v2.png`
RTL/LTR result: header semantics and physical artwork coordinates preserve locale direction
Mobile result: single-row compact header and sheet navigation implemented; final post-H20 regression remains
Tests: focused landing, public-shell and theme tests 10/10 passed before final asset coordinate update
Build/typecheck: production build passed before final asset coordinate update; focused web typecheck passed
Remaining issues: footer destinations are disabled pending verified project URLs; final H20 sync and full regression required
