import pandas as pd

# --- configuration ---
input_csv = "data.csv"         # your raw data file
output_tex = "boxplots.tex"    # LaTeX code output

# Read your data. Each column = one group
df = pd.read_csv(input_csv)

with open(output_tex, "w") as f:
    for col in df.columns:
        data = df[col].dropna()
        q = data.quantile([0, 0.25, 0.5, 0.75, 1])
        lower_whisker = q.loc[0.00]
        lower_quartile = q.loc[0.25]
        median = q.loc[0.50]
        upper_quartile = q.loc[0.75]
        upper_whisker = q.loc[1.00]

        f.write(
            "\\addplot+[\n"
            " boxplot prepared={\n"
            f"  median={median:.3f},\n"
            f"  upper quartile={upper_quartile:.3f},\n"
            f"  lower quartile={lower_quartile:.3f},\n"
            f"  upper whisker={upper_whisker:.3f},\n"
            f"  lower whisker={lower_whisker:.3f}\n"
            " }] coordinates {};\n\n"
        )

print(f"LaTeX code written to {output_tex}")
