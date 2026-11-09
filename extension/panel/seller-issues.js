function findSellerIssues(description) {
  const rules = [
    ["transmission", "Transmission trouble", /\b(?:transmission (?:is )?(?:slip\w*|jerk\w*|problem\w*|issue\w*)|slipping transmission|needs (?:a )?(?:new )?transmission|shifts? (?:hard|rough))\b/i],
    ["engine-light", "Check engine light", /\b(?:check engine light (?:is )?(?:on|lit|flashing)|(?:on|flashing) check engine light)\b/i],
    ["overheating", "Engine overheating", /\b(?:overheat(?:s|ing)?|runs hot|temperature gauge (?:goes|gets) high)\b/i],
    ["leak", "Fluid leak", /\b(?:(?:oil|coolant|transmission fluid) leak\w*|leak\w* (?:oil|coolant|transmission fluid))\b/i],
    ["brakes", "Brake trouble", /\b(?:brakes? (?:are )?(?:grinding|squealing|worn|need\w* (?:work|replac\w*))|needs? (?:new )?(?:brakes|brake pads|rotors))\b/i],
    ["tires", "Worn tires", /\b(?:tires? (?:are )?(?:bald|worn|need\w* replac\w*)|needs? (?:new )?tires)\b/i],
    ["air-conditioning", "Air conditioning trouble", /\b(?:a\/c|ac|air conditioning) (?:is )?(?:does(?: not|n't) work|not (?:working|cold|blowing cold)|blows? (?:warm|hot)(?: air)?)\b/i],
    ["starting", "Starting trouble", /\b(?:won't start|does(?: not|n't) start|hard to start|needs? (?:a )?(?:new )?(?:starter|battery)|dead battery)\b/i],
    ["rust", "Rust", /\b(?:rust|rusted|rusty)\b/i],
    ["unspecified-repair", "Repair needed (details unclear)", /\bneeds? (?:some |a little )?(?:(?:minor|major|mechanical|cosmetic|body) )?(?:work|repairs?)\b/i]
  ];

  // Keep contrast clauses separate so a repair doesn't hide a problem reported after “but”.
  const clauses = description.split(/[.!?;\n]+|,?\s+\b(?:but|however|although|except)\b\s+/i);
  const issues = [];
  for (const [issueId, name, pattern] of rules) {
    for (const clause of clauses) {
      const sourceText = clause.trim();
      const text = sourceText.replace(/[’‘]/g, "'");
      const match = text.match(pattern);
      if (!match) continue;

      const before = text.slice(0, match.index);
      const after = text.slice(match.index + match[0].length);
      const denied = /\b(?:no|not|never|without|doesn't|don't|didn't)\b(?:[\s-]+[\w'-]+){0,3}[\s-]*$/i.test(before) ||
        /^[-\s]*(?:free|proof\w*|is (?:off|gone)|anymore|no longer)\b/i.test(after);
      const repaired = /\b(?:fixed|repaired|resolved|stopped|used to)\b(?:\s+[\w'-]+){0,3}\s*$/i.test(before) ||
        /^(?:\s+(?:was|is|has been|now|recently|already))*\s+(?:fixed|repaired|resolved|stopped)\b/i.test(after) ||
        /^\s+before\b.*\b(?:replaced|fixed|repaired)\b/i.test(after);
      if (denied || repaired) continue;

      issues.push({ issueId, name, category: "seller-disclosed", sourceText, reviewed: false, status: "possible" });
      break;
    }
  }
  return issues;
}
