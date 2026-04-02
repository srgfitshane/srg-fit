import pathlib

path = pathlib.Path(r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\workout\[sessionId]\page.tsx')
src = path.read_text(encoding='utf-8')

# Fix the join('\n') that got a literal newline
src = src.replace(".join('\x0a')", r".join('\n')", 1)

# Fix the split('\n') that got a literal newline  
src = src.replace(".split('\x0a')", r".split('\n')", 1)

# Fix the template literal that has a literal newline before ${candidateList}
# The pattern is: ...one per line:\n${candidateList}` }]
src = src.replace(
    "Suggest 5 exercises to ADD that complement this session (fill gaps, finish strong). Return ONLY the IDs from this list, one per line:\n${candidateList}`",
    r"Suggest 5 exercises to ADD that complement this session (fill gaps, finish strong). Return ONLY the IDs from this list, one per line:\n${candidateList}`"
)

path.write_text(src, encoding='utf-8')
print('done')
