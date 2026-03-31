import os, sys
root = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src'
issues = []
skip_dirs = {'node_modules', '.next'}

WILDCARD = "'*'"

for dirpath, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for f in files:
        if not f.endswith(('.ts','.tsx')): continue
        path = os.path.join(dirpath, f)
        try: src = open(path, encoding='utf-8', errors='ignore').read()
        except: continue
        rel = path.replace(root, '')
        lines = src.splitlines()

        for i, l in enumerate(lines):
            # Wildcard CORS
            if 'Access-Control-Allow-Origin' in l and WILDCARD in l and '/api/' in rel:
                issues.append(('CORS_WILDCARD', rel, i+1, l.strip()[:80]))
            # XSS risk
            if 'dangerouslySetInnerHTML' in l:
                issues.append(('XSS_RISK', rel, i+1, l.strip()[:80]))
            # eval
            if 'eval(' in l and not l.strip().startswith('//'):
                issues.append(('EVAL_RISK', rel, i+1, l.strip()[:80]))
            # Stripe secret as public
            if 'NEXT_PUBLIC_STRIPE_SECRET' in l:
                issues.append(('STRIPE_KEY_PUBLIC', rel, i+1, l.strip()[:80]))
            # unvalidated redirect with user input
            if 'redirect(' in l and ('req.query' in l or 'searchParams' in l or 'params.' in l):
                issues.append(('OPEN_REDIRECT', rel, i+1, l.strip()[:80]))
            # rate limiting absent on sensitive routes
            if '/api/invite' in rel and 'rate' in l.lower():
                issues.append(('RATE_LIMIT_PRESENT', rel, i+1, l.strip()[:80]))

for tag, rel, ln, txt in issues:
    sys.stdout.buffer.write(f'{tag} {rel}:{ln} {txt}\n'.encode('utf-8','replace'))
print(f'Total: {len(issues)}')
