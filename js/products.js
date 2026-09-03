// products.js — shared product data for TXBioResearch catalog and detail pages
const PRODUCTS = [
  {
    slug: "retatrutide-5mg",
    name: "Retatrutide",
    packSize: "10 vials x 5mg",
    price: 60,
    category: "Metabolic Research Peptide",
    description: "Retatrutide is a triple-agonist peptide studied in metabolic and endocrine research settings, most commonly in in-vitro and preclinical models investigating receptor activity and energy metabolism pathways.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use within the timeframe indicated by your lab protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "retatrutide-15mg",
    name: "Retatrutide",
    packSize: "30 vials x 15mg",
    price: 90,
    category: "Metabolic Research Peptide",
    description: "Retatrutide is a triple-agonist peptide studied in metabolic and endocrine research settings, most commonly in in-vitro and preclinical models investigating receptor activity and energy metabolism pathways. This is a higher-concentration pack size for larger research protocols.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use within the timeframe indicated by your lab protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "glow-blend-70mg",
    name: "GLOW Blend",
    packSize: "10 vials x 70mg",
    price: 70,
    category: "Combination Research Peptide Blend",
    description: "GLOW is a multi-peptide blend formulated for research protocols studying combined peptide interactions, commonly referenced in dermal and regenerative research literature.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder blend"
  },
  {
    slug: "tesamorelin-10mg",
    name: "Tesamorelin",
    packSize: "10 vials x 10mg",
    price: 80,
    category: "Growth Hormone-Releasing Peptide",
    description: "Tesamorelin is a synthetic peptide analog studied for its interaction with growth hormone-releasing hormone (GHRH) receptors in endocrine and metabolic research.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use within the timeframe indicated by your lab protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "tesamorelin-20mg",
    name: "Tesamorelin",
    packSize: "20 vials x 20mg",
    price: 160,
    category: "Growth Hormone-Releasing Peptide",
    description: "Tesamorelin is a synthetic peptide analog studied for its interaction with growth hormone-releasing hormone (GHRH) receptors in endocrine and metabolic research. This is a higher-concentration pack size for larger research protocols.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use within the timeframe indicated by your lab protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "vitamin-b12-10mg",
    name: "Vitamin B-12",
    packSize: "10 vials x 10mg",
    price: 55,
    category: "Research Reagent",
    description: "Vitamin B-12 (cobalamin) is supplied here as a research-grade reagent for laboratory studies involving cellular metabolism and cofactor research applications.",
    storage: "Store away from light at -20°C. Once reconstituted, refrigerate at 2-8°C.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "ipamorelin-10mg",
    name: "Ipamorelin",
    packSize: "10 vials x 10mg",
    price: 65,
    category: "Growth Hormone Secretagogue Peptide",
    description: "Ipamorelin is a pentapeptide studied in research settings for its selective interaction with the ghrelin/growth hormone secretagogue receptor.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use within the timeframe indicated by your lab protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "glutathione-1500mg",
    name: "Glutathione",
    packSize: "10 vials x 1500mg",
    price: 80,
    category: "Antioxidant Research Reagent",
    description: "Glutathione is a tripeptide widely used as a research reagent in oxidative stress and cellular antioxidant pathway studies.",
    storage: "Store lyophilized powder at -20°C, protected from light. Once reconstituted, refrigerate at 2-8°C.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "igf-1-100mcg",
    name: "IGF-1",
    packSize: "30 vials x 100mcg",
    price: 65,
    category: "Growth Factor Research Peptide",
    description: "IGF-1 (Insulin-like Growth Factor 1) is studied extensively in cell proliferation, tissue growth, and signaling pathway research.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use promptly per your lab's stability protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "hcg-5000iu",
    name: "HCG",
    packSize: "10 vials x 5000iu",
    price: 70,
    category: "Hormone Research Reagent",
    description: "Human Chorionic Gonadotropin (HCG) is a glycoprotein hormone used in reproductive endocrinology and cell signaling research.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "semax-10mg",
    name: "Semax",
    packSize: "10 vials x 10mg",
    price: 75,
    category: "Neuropeptide Research Compound",
    description: "Semax is a synthetic peptide derived from ACTH fragments, studied in neuroscience research for its interaction with neurotrophic signaling pathways.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use within the timeframe indicated by your lab protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "mots-c-20mg",
    name: "MOTS-c",
    packSize: "10 vials x 20mg",
    price: 75,
    category: "Mitochondrial-Derived Peptide",
    description: "MOTS-c is a mitochondrial-derived peptide studied in metabolic research for its role in cellular energy homeostasis and stress-response signaling.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C and use within the timeframe indicated by your lab protocol.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "lipo-c",
    name: "Lipo-C",
    packSize: "20 vials",
    price: 90,
    category: "Lipotropic Research Blend",
    description: "Lipo-C is a lipotropic compound blend used in research settings studying lipid metabolism pathways.",
    storage: "Refrigerate at 2-8°C, protect from light.",
    purity: "Research grade",
    form: "Liquid solution"
  },
  {
    slug: "nad-1000mg",
    name: "NAD+",
    packSize: "20 vials x 1000mg",
    price: 50,
    category: "Coenzyme Research Reagent",
    description: "Nicotinamide adenine dinucleotide (NAD+) is a coenzyme central to cellular energy metabolism and is widely used in research on aging, mitochondrial function, and redox biology.",
    storage: "Store lyophilized powder at -20°C, protected from light. Once reconstituted, refrigerate at 2-8°C.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "bac-water-10ml",
    name: "Bacteriostatic Water",
    packSize: "20 vials x 10ml",
    price: 10,
    category: "Laboratory Reconstitution Solvent",
    description: "Bacteriostatic water containing 0.9% benzyl alcohol, used in laboratory settings for reconstituting lyophilized peptide compounds.",
    storage: "Store at room temperature, protect from light. Refrigerate after opening per standard lab protocol.",
    purity: "USP grade solvent",
    form: "Sterile liquid"
  },
  {
    slug: "5-amino-1mq-10mg",
    name: "5-Amino-1MQ",
    packSize: "10 vials x 10mg",
    price: 70,
    category: "Small Molecule Research Compound",
    description: "5-Amino-1MQ is a small molecule studied in metabolic research for its interaction with NNMT (nicotinamide N-methyltransferase) enzyme pathways.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder"
  },
  {
    slug: "klow-blend-80mg",
    name: "KLOW Blend",
    packSize: "20 vials x 80mg",
    price: 125,
    category: "Combination Research Peptide Blend",
    description: "KLOW is a multi-peptide blend formulated for research protocols studying combined peptide interactions, commonly referenced in dermal and regenerative research literature.",
    storage: "Store lyophilized powder at -20°C. Once reconstituted, refrigerate at 2-8°C.",
    purity: "≥98% (HPLC)",
    form: "Lyophilized powder blend"
  }
];
