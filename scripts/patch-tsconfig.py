import io, json
PATH = r"C:\Users\Shane\OneDrive\Desktop\srg-fit\tsconfig.json"
with io.open(PATH, "r", encoding="utf-8") as f:
    cfg = json.load(f)
if "scripts/**" not in cfg.get("exclude", []):
    cfg["exclude"].append("scripts/**")
with io.open(PATH, "w", encoding="utf-8", newline="\n") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print("exclude:", cfg["exclude"])