import { csvCell, parseCsv, toCsv } from "./csv.util";

describe("csv", () => {
  it("parses quotes, escaped quotes, commas and newlines inside quotes, CRLF and blank lines", () => {
    expect(parseCsv('name,notes\r\n"Sara, R","said ""hi""\nthen left"\n\nAli,x')).toEqual([
      ["name", "notes"],
      ["Sara, R", 'said "hi"\nthen left'],
      ["Ali", "x"],
    ]);
  });

  it("neutralises spreadsheet formulas and quotes when needed", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+98 912")).toBe("'+98 912");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});
