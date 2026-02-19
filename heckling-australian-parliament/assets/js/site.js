function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const PARTY_LABELS = {
  ALP: "Australian Labor Party",
  LIB: "Liberal Party of Australia",
  LIBERAL: "Liberal Party of Australia",
  NATIONAL: "National Party of Australia",
  LNP: "Liberal National Party of Queensland",
  GREENS: "Australian Greens",
  IND: "Independent",
  CLP: "Country Liberal Party",
  KAP: "Katter's Australian Party",
  CA: "Conservative/other minor party (source abbreviation)",
  NAT: "National Party (source abbreviation)",
};

async function loadCsv(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const text = (await res.text()).replace(/^\uFEFF/, "");
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const [header, ...rows] = lines;
  const cols = parseCsvLine(header);
  return rows.map((row) => {
    const vals = parseCsvLine(row);
    const out = {};
    cols.forEach((c, i) => {
      out[c.trim()] = (vals[i] || "").trim();
    });
    return out;
  });
}

function setupScrolly() {
  const image = document.getElementById("scrolly-image");
  const chapters = Array.from(document.querySelectorAll(".chapter"));
  const navBtns = Array.from(document.querySelectorAll(".chart-nav-btn"));
  if (!image || chapters.length === 0) return;
  let activeChart = null;

  const activate = (chapter) => {
    if (!chapter) return;
    const target = chapter.getAttribute("data-chart");
    if (!target || target === activeChart) return;
    activeChart = target;
    chapters.forEach((c) => c.classList.remove("is-active"));
    chapter.classList.add("is-active");
    image.setAttribute("src", target);
    navBtns.forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-chart") === target);
    });
  };

  chapters.forEach((c) => {
    c.addEventListener("click", () => activate(c));
  });
  navBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const target = b.getAttribute("data-chart");
      if (target) image.setAttribute("src", target);
      navBtns.forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      const matched = chapters.find((c) => c.getAttribute("data-chart") === target);
      if (matched) {
        chapters.forEach((c) => c.classList.remove("is-active"));
        matched.classList.add("is-active");
      }
    });
  });

  if (typeof window.IntersectionObserver !== "function") {
    return;
  }

  try {
    // Activate whichever chapter is closest to viewport center for smoother transitions.
    const chooseClosestChapter = () => {
      const centerY = window.innerHeight * 0.45;
      let best = null;
      let bestDist = Number.POSITIVE_INFINITY;
      chapters.forEach((c) => {
        const r = c.getBoundingClientRect();
        const chapterCenter = r.top + r.height / 2;
        const dist = Math.abs(chapterCenter - centerY);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      });
      if (best) activate(best);
    };

    let rafId = 0;
    const onScrollOrResize = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        chooseClosestChapter();
      });
    };
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    const observer = new IntersectionObserver(
      () => {
        chooseClosestChapter();
      },
      { threshold: [0, 0.15, 0.35, 0.6, 0.85], rootMargin: "-12% 0px -22% 0px" }
    );
    chapters.forEach((c) => observer.observe(c));
    chooseClosestChapter();
  } catch {
    // Keep click-based fallback only.
  }
}

function drawCoefficientPlot(rows, model) {
  const svg = document.getElementById("coef-plot");
  if (!svg) return;
  const data = rows.filter((r) => r.model === model);
  if (data.length === 0) {
    svg.innerHTML = `<text x="20" y="32" fill="#444" font-size="14">No coefficient data found.</text>`;
    return;
  }

  const W = 900;
  const H = 360;
  const margin = { top: 24, right: 24, bottom: 34, left: 310 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const vals = data.flatMap((d) => [Number(d.ci_low), Number(d.ci_high), Number(d.coef)]);
  const minX = Math.min(...vals, -0.2);
  const maxX = Math.max(...vals, 0.2);
  const pad = (maxX - minX) * 0.08;
  const x0 = minX - pad;
  const x1 = maxX + pad;
  const xScale = (v) => margin.left + ((v - x0) / (x1 - x0)) * innerW;
  const yScale = (i) => margin.top + (i + 0.5) * (innerH / data.length);

  const axisTicks = 6;
  let out = "";
  out += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fcfaf5"></rect>`;

  const zeroX = xScale(0);
  out += `<line x1="${zeroX}" y1="${margin.top}" x2="${zeroX}" y2="${H - margin.bottom}" stroke="#8c8c8c" stroke-width="1.2" stroke-dasharray="4 4"></line>`;

  for (let t = 0; t <= axisTicks; t += 1) {
    const v = x0 + (t / axisTicks) * (x1 - x0);
    const x = xScale(v);
    out += `<line x1="${x}" y1="${H - margin.bottom}" x2="${x}" y2="${H - margin.bottom + 5}" stroke="#888"></line>`;
    out += `<text x="${x}" y="${H - margin.bottom + 18}" text-anchor="middle" font-size="11" fill="#555">${v.toFixed(2)}</text>`;
  }

  data.forEach((d, i) => {
    const y = yScale(i);
    const coef = Number(d.coef);
    const low = Number(d.ci_low);
    const high = Number(d.ci_high);
    const color = coef >= 0 ? "#4c72b0" : "#c44e52";

    out += `<line x1="${xScale(low)}" y1="${y}" x2="${xScale(high)}" y2="${y}" stroke="${color}" stroke-width="2"></line>`;
    out += `<circle cx="${xScale(coef)}" cy="${y}" r="4.6" fill="${color}">
      <title>${d.label}: ${coef.toFixed(3)} (95% CI ${low.toFixed(3)} to ${high.toFixed(3)})</title>
    </circle>`;
    out += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#2d2d2d">${d.label}</text>`;
  });

  out += `<text x="${margin.left}" y="16" font-size="13" fill="#333">Coefficient (with 95% CI)</text>`;
  svg.innerHTML = out;
}

function setupModelToggle(rows) {
  const btns = Array.from(document.querySelectorAll(".coef-btn"));
  if (btns.length === 0) return;
  const svg = document.getElementById("coef-plot");
  if (svg) svg.style.display = "block";
  let current = "negative_binomial";
  drawCoefficientPlot(rows, current);
  const fallback = document.getElementById("coef-fallback");
  if (fallback) fallback.style.display = "none";
  btns.forEach((b) => {
    b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      current = b.getAttribute("data-model") || "negative_binomial";
      drawCoefficientPlot(rows, current);
    });
  });
}

function setupFallbackCoefToggle() {
  const btns = Array.from(document.querySelectorAll(".coef-btn"));
  const fallback = document.getElementById("coef-fallback");
  const svg = document.getElementById("coef-plot");
  if (!fallback || btns.length === 0) return;
  if (svg) svg.style.display = "none";
  fallback.style.display = "block";

  btns.forEach((b) => {
    b.addEventListener("click", () => {
      btns.forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      const model = b.getAttribute("data-model") || "negative_binomial";
      fallback.setAttribute(
        "src",
        model === "logit"
          ? "assets/charts/model_coefficients_logit.svg"
          : "assets/charts/model_coefficients_nb.svg"
      );
    });
  });
}

async function hydrateStats() {
  try {
    const trend = await loadCsv("assets/data/yearly_interjection_rate_by_gender.csv");
    const events = trend.reduce((acc, d) => acc + Number(d.n || 0), 0);
    let totalHeckles = trend.reduce((acc, d) => {
      const nHeckles = Number(d.n_heckles);
      if (!Number.isNaN(nHeckles)) return acc + nHeckles;
      const n = Number(d.n || 0);
      const avgInterj = Number(d.avg_interjections);
      if (!Number.isNaN(avgInterj)) return acc + n * avgInterj;
      return acc;
    }, 0);
    totalHeckles = Math.round(totalHeckles);

    const eventsEl = document.getElementById("n-events");
    const hecklesEl = document.getElementById("total-heckles");
    if (eventsEl) eventsEl.textContent = events.toLocaleString("en-US");
    if (hecklesEl) hecklesEl.textContent = totalHeckles.toLocaleString("en-US");
  } catch {
    // Keep static fallback values in markup.
  }
}

async function hydrateTopicCallouts() {
  try {
    const rows = await loadCsv("assets/data/topic_findings_summary.csv");
    const byFinding = {};
    rows.forEach((r) => {
      byFinding[r.finding] = r;
    });
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    if (byFinding.largest_widening_topic) {
      const r = byFinding.largest_widening_topic;
      const v = Number(r.value);
      set(
        "topic-largest-widening",
        `${r.topic_label} (${v >= 0 ? "+" : ""}${v.toFixed(2)} pp/year)`
      );
    }
    if (byFinding.reversal_topic) {
      const r = byFinding.reversal_topic;
      set("topic-reversal", `${r.topic_label} (gap changes sign over time)`);
    } else {
      set("topic-reversal", "No clear sign-reversal topic in current run.");
    }
    if (byFinding.most_stable_topic) {
      const r = byFinding.most_stable_topic;
      const v = Number(r.value);
      set(
        "topic-stable",
        `${r.topic_label} (slope ${v >= 0 ? "+" : ""}${v.toFixed(2)} pp/year)`
      );
    }
  } catch {
    // Keep server-rendered defaults in place.
  }
}

function drawPolicyTopicInteractive(rows, topicLongRows, uncertaintyRows, uncertaintyTopicRows) {
  const svg = document.getElementById("topic-time-svg");
  const controls = document.getElementById("topic-legend-controls");
  const viewControls = document.getElementById("topic-view-controls");
  const metricControls = document.getElementById("topic-metric-controls");
  const tooltip = document.getElementById("topic-tooltip");
  const fallback = document.getElementById("topic-time-fallback");
  const caption = document.getElementById("topic-chart-caption");
  if (!svg || !controls || !tooltip) return;

  if (!rows || rows.length === 0) {
    if (fallback) fallback.style.display = "block";
    svg.style.display = "none";
    return;
  }

  if (fallback) fallback.style.display = "none";
  svg.style.display = "block";

  const data = rows
    .map((r) => ({
      year: Number(r.year),
      topic: r.policy_topic_label,
      gap: Number(r.gap_pp_male_minus_female),
    }))
    .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.gap) && r.topic);

  const byTopic = {};
  data.forEach((d) => {
    if (!byTopic[d.topic]) byTopic[d.topic] = [];
    byTopic[d.topic].push(d);
  });
  const topics = Object.keys(byTopic).sort();
  topics.forEach((t) => byTopic[t].sort((a, b) => a.year - b.year));

  const W = 980;
  const H = 430;
  const margin = { top: 20, right: 150, bottom: 34, left: 56 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const years = data.map((d) => d.year);
  const vals = data.map((d) => d.gap);
  const xMin = Math.min(...years);
  const xMax = Math.max(...years);
  const yMin = Math.min(-2, Math.floor(Math.min(...vals) - 1));
  const yMax = Math.max(2, Math.ceil(Math.max(...vals) + 1));

  const xScale = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const yScale = (y) => margin.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

  const colors = ["#4c72b0", "#c44e52", "#55a868", "#8172b3", "#ccb974", "#64b5cd", "#dd8452"];
  const colorMap = {};
  topics.forEach((t, i) => {
    colorMap[t] = colors[i % colors.length];
  });

  let activeTopic = topics.includes("Economy") ? "Economy" : topics[0];
  let viewMode = "focus";
  let metricMode = "trends";

  const overallByTopic = {};
  (topicLongRows || [])
    .map((r) => ({
      year: Number(r.year),
      topic: r.policy_topic_label,
      n: Number(r.n),
      rate: Number(r.interjection_rate),
    }))
    .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.n) && Number.isFinite(r.rate) && r.topic)
    .forEach((r) => {
      const k = `${r.topic}::${r.year}`;
      if (!overallByTopic[k]) overallByTopic[k] = { topic: r.topic, year: r.year, wsum: 0, nsum: 0 };
      overallByTopic[k].wsum += r.rate * r.n;
      overallByTopic[k].nsum += r.n;
    });
  const overallData = Object.values(overallByTopic)
    .filter((d) => d.nsum > 0)
    .map((d) => ({ topic: d.topic, year: d.year, ratePct: (d.wsum / d.nsum) * 100 }));
  const overallTopicSeries = {};
  overallData.forEach((d) => {
    if (!overallTopicSeries[d.topic]) overallTopicSeries[d.topic] = [];
    overallTopicSeries[d.topic].push(d);
  });
  Object.keys(overallTopicSeries).forEach((t) => {
    overallTopicSeries[t].sort((a, b) => a.year - b.year);
  });

  const setTooltip = (x, y, text) => {
    tooltip.hidden = false;
    tooltip.textContent = text;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  };
  const hideTooltip = () => {
    tooltip.hidden = true;
  };

  const render = () => {
    if (metricMode === "uncertainty") {
      renderUncertainty();
      return;
    }
    if (metricMode === "overall") {
      renderOverall();
      return;
    }
    const visibleTopics = viewMode === "compare" ? topics : [activeTopic];
    const visibleVals = data.filter((d) => visibleTopics.includes(d.topic)).map((d) => d.gap);
    const localMin = Math.min(...visibleVals, 0);
    const localMax = Math.max(...visibleVals, 0);
    const yPad = Math.max(2, (localMax - localMin) * 0.15);
    const yLo = localMin - yPad;
    const yHi = localMax + yPad;
    const yScaleLocal = (y) => margin.top + (1 - (y - yLo) / (yHi - yLo || 1)) * innerH;

    let out = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fffdf8"></rect>`;
    const yTicks = 6;
    for (let i = 0; i <= yTicks; i += 1) {
      const v = yLo + (i / yTicks) * (yHi - yLo);
      const y = yScaleLocal(v);
      out += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="#eee6d8"></line>`;
      out += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b6459">${v.toFixed(0)}</text>`;
    }
    out += `<line x1="${margin.left}" y1="${yScaleLocal(0)}" x2="${W - margin.right}" y2="${yScaleLocal(0)}" stroke="#a8a096" stroke-dasharray="4 4"></line>`;

    const xTicks = Math.min(8, xMax - xMin);
    for (let i = 0; i <= xTicks; i += 1) {
      const v = Math.round(xMin + (i / xTicks) * (xMax - xMin));
      const x = xScale(v);
      out += `<line x1="${x}" y1="${H - margin.bottom}" x2="${x}" y2="${H - margin.bottom + 4}" stroke="#857d71"></line>`;
      out += `<text x="${x}" y="${H - margin.bottom + 16}" text-anchor="middle" font-size="11" fill="#6b6459">${v}</text>`;
    }

    topics.forEach((topic) => {
      const s = byTopic[topic];
      const isFaded = viewMode === "focus" && topic !== activeTopic;
      const stroke = colorMap[topic];
      const opacity = isFaded ? 0.14 : 0.95;
      const points = s.map((p) => `${xScale(p.year)},${yScaleLocal(p.gap)}`).join(" ");
      out += `<polyline fill="none" stroke="${stroke}" stroke-width="${activeTopic === topic ? 3.3 : 2}" opacity="${opacity}" points="${points}"></polyline>`;
      s.forEach((p) => {
        out += `<circle class="topic-dot" data-topic="${topic}" data-year="${p.year}" data-gap="${p.gap.toFixed(2)}" cx="${xScale(p.year)}" cy="${yScaleLocal(p.gap)}" r="${activeTopic === topic ? 3.4 : 2.2}" fill="${stroke}" opacity="${opacity}"></circle>`;
      });
    });

    // Draw non-overlapping end labels only in focus mode (compare mode already has topic pills).
    if (viewMode === "focus" && byTopic[activeTopic] && byTopic[activeTopic].length) {
      const s = byTopic[activeTopic];
      const last = s[s.length - 1];
      const stroke = colorMap[activeTopic];
      out += `<text x="${xScale(last.year) + 8}" y="${yScaleLocal(last.gap) + 3}" font-size="11" fill="${stroke}">${activeTopic}</text>`;
    }

    out += `<text x="${margin.left}" y="14" font-size="13" fill="#3b362f">Male minus female gap (percentage points)</text>`;
    svg.innerHTML = out;

    Array.from(svg.querySelectorAll(".topic-dot")).forEach((dot) => {
      dot.addEventListener("mouseenter", (ev) => {
        const t = ev.target.getAttribute("data-topic");
        const y = ev.target.getAttribute("data-year");
        const g = ev.target.getAttribute("data-gap");
        setTooltip(ev.offsetX + 10, ev.offsetY, `${t} • ${y}: ${g} pp`);
      });
      dot.addEventListener("mousemove", (ev) => {
        setTooltip(ev.offsetX + 10, ev.offsetY, tooltip.textContent || "");
      });
      dot.addEventListener("mouseleave", hideTooltip);
      dot.addEventListener("click", (ev) => {
        const topic = ev.target.getAttribute("data-topic");
        if (topic) {
          activeTopic = topic;
          viewMode = "focus";
          Array.from(controls.querySelectorAll(".topic-pill")).forEach((el) => {
            el.classList.toggle("is-active", el.textContent === topic);
          });
          Array.from((viewControls || document).querySelectorAll(".topic-view-pill")).forEach((el) => {
            el.classList.toggle("is-active", el.dataset.mode === "focus");
          });
          render();
        }
      });
    });

    if (caption && byTopic[activeTopic] && byTopic[activeTopic].length) {
      const s = byTopic[activeTopic];
      const first = s[0];
      const last = s[s.length - 1];
      const trend = (last.gap - first.gap) / Math.max(1, last.year - first.year);
      const trendWord = trend > 0.08 ? "widening" : trend < -0.08 ? "narrowing" : "stable";
      caption.textContent =
        `Selected topic: ${activeTopic}. Latest gap: ${last.gap.toFixed(1)} pp (${last.year}). ` +
        `Long-run direction: ${trendWord} (${trend.toFixed(2)} pp/year).`;
    }
  };

  const renderOverall = () => {
    const visibleTopics = viewMode === "compare" ? topics : [activeTopic];
    const visibleVals = overallData.filter((d) => visibleTopics.includes(d.topic)).map((d) => d.ratePct);
    const localMin = Math.min(...visibleVals, 0);
    const localMax = Math.max(...visibleVals, 0);
    const yPad = Math.max(1.5, (localMax - localMin) * 0.15);
    const yLo = Math.max(0, localMin - yPad);
    const yHi = localMax + yPad;
    const yScaleLocal = (y) => margin.top + (1 - (y - yLo) / (yHi - yLo || 1)) * innerH;

    let out = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fffdf8"></rect>`;
    const yTicks = 6;
    for (let i = 0; i <= yTicks; i += 1) {
      const v = yLo + (i / yTicks) * (yHi - yLo);
      const y = yScaleLocal(v);
      out += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="#eee6d8"></line>`;
      out += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b6459">${v.toFixed(0)}</text>`;
    }
    const xTicks = Math.min(8, xMax - xMin);
    for (let i = 0; i <= xTicks; i += 1) {
      const v = Math.round(xMin + (i / xTicks) * (xMax - xMin));
      const x = xScale(v);
      out += `<line x1="${x}" y1="${H - margin.bottom}" x2="${x}" y2="${H - margin.bottom + 4}" stroke="#857d71"></line>`;
      out += `<text x="${x}" y="${H - margin.bottom + 16}" text-anchor="middle" font-size="11" fill="#6b6459">${v}</text>`;
    }

    topics.forEach((topic) => {
      const s = overallTopicSeries[topic] || [];
      if (!s.length) return;
      const isFaded = viewMode === "focus" && topic !== activeTopic;
      const stroke = colorMap[topic];
      const opacity = isFaded ? 0.14 : 0.95;
      const points = s.map((p) => `${xScale(p.year)},${yScaleLocal(p.ratePct)}`).join(" ");
      out += `<polyline fill="none" stroke="${stroke}" stroke-width="${activeTopic === topic ? 3.3 : 2}" opacity="${opacity}" points="${points}"></polyline>`;
      s.forEach((p) => {
        out += `<circle class="topic-dot-overall" data-topic="${topic}" data-year="${p.year}" data-rate="${p.ratePct.toFixed(
          2
        )}" cx="${xScale(p.year)}" cy="${yScaleLocal(p.ratePct)}" r="${activeTopic === topic ? 3.4 : 2.2}" fill="${stroke}" opacity="${opacity}"></circle>`;
      });
    });

    out += `<text x="${margin.left}" y="14" font-size="13" fill="#3b362f">Overall heckling rate by topic (all speakers, %)</text>`;
    svg.innerHTML = out;

    Array.from(svg.querySelectorAll(".topic-dot-overall")).forEach((dot) => {
      dot.addEventListener("mouseenter", (ev) => {
        const t = ev.target.getAttribute("data-topic");
        const y = ev.target.getAttribute("data-year");
        const r = ev.target.getAttribute("data-rate");
        setTooltip(ev.offsetX + 10, ev.offsetY, `${t} • ${y}: ${r}%`);
      });
      dot.addEventListener("mousemove", (ev) => {
        setTooltip(ev.offsetX + 10, ev.offsetY, tooltip.textContent || "");
      });
      dot.addEventListener("mouseleave", hideTooltip);
      dot.addEventListener("click", (ev) => {
        const topic = ev.target.getAttribute("data-topic");
        if (topic) {
          activeTopic = topic;
          viewMode = "focus";
          Array.from(controls.querySelectorAll(".topic-pill")).forEach((el) => {
            el.classList.toggle("is-active", el.textContent === topic);
          });
          Array.from((viewControls || document).querySelectorAll(".topic-view-pill")).forEach((el) => {
            el.classList.toggle("is-active", el.dataset.mode === "focus");
          });
          render();
        }
      });
    });

    if (caption && overallTopicSeries[activeTopic] && overallTopicSeries[activeTopic].length) {
      const s = overallTopicSeries[activeTopic];
      const first = s[0];
      const last = s[s.length - 1];
      const trend = (last.ratePct - first.ratePct) / Math.max(1, last.year - first.year);
      const trendWord = trend > 0.08 ? "rising" : trend < -0.08 ? "falling" : "stable";
      caption.textContent =
        `Selected topic: ${activeTopic}. Latest overall heckling rate: ${last.ratePct.toFixed(1)}% (${last.year}). ` +
        `Long-run direction: ${trendWord} (${trend.toFixed(2)} pp/year).`;
    }
  };

  const renderUncertainty = () => {
    const byTopic = (uncertaintyTopicRows || [])
      .map((r) => ({
        topic: r.policy_topic_label,
        coef: Number(r.coef),
        se: Number(r.se),
        pvalue: Number(r.pvalue),
        n: Number(r.n),
      }))
      .filter((r) => r.topic && Number.isFinite(r.coef) && Number.isFinite(r.se))
      .sort((a, b) => a.coef - b.coef);

    if (byTopic.length) {
      const W = 980;
      const H = 430;
      const margin = { top: 32, right: 48, bottom: 36, left: 220 };
      const innerW = W - margin.left - margin.right;
      const innerH = H - margin.top - margin.bottom;
      const vals = byTopic.flatMap((d) => [d.coef - 1.96 * d.se, d.coef + 1.96 * d.se, d.coef, 0]);
      const xMin = Math.min(...vals) - 0.02;
      const xMax = Math.max(...vals) + 0.02;
      const xScale = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
      const yScale = (i) => margin.top + (i + 0.5) * (innerH / byTopic.length);

      let out = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fffdf8"></rect>`;
      out += `<line x1="${xScale(0)}" y1="${margin.top}" x2="${xScale(0)}" y2="${H - margin.bottom}" stroke="#988f82" stroke-dasharray="4 4"></line>`;
      const ticks = 7;
      for (let i = 0; i <= ticks; i += 1) {
        const v = xMin + (i / ticks) * (xMax - xMin);
        const x = xScale(v);
        out += `<line x1="${x}" y1="${H - margin.bottom}" x2="${x}" y2="${H - margin.bottom + 4}" stroke="#857d71"></line>`;
        out += `<text x="${x}" y="${H - margin.bottom + 16}" text-anchor="middle" font-size="11" fill="#6b6459">${v.toFixed(2)}</text>`;
      }

      byTopic.forEach((d, i) => {
        const y = yScale(i);
        const lo = d.coef - 1.96 * d.se;
        const hi = d.coef + 1.96 * d.se;
        const color = d.coef < 0 ? "#c44e52" : "#4c72b0";
        out += `<line x1="${xScale(lo)}" y1="${y}" x2="${xScale(hi)}" y2="${y}" stroke="${color}" stroke-width="2.4"></line>`;
        out += `<circle cx="${xScale(d.coef)}" cy="${y}" r="4.8" fill="${color}"></circle>`;
        out += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="13" fill="#2f2b26">${d.topic}</text>`;
        out += `<text x="${xScale(hi) + 8}" y="${y + 4}" font-size="11" fill="#4a453d">${d.coef.toFixed(3)}</text>`;
      });
      out += `<text x="${margin.left}" y="16" font-size="13" fill="#3b362f">Uncertainty coefficient by topic (95% CI)</text>`;
      svg.innerHTML = out;

      if (caption) {
        const sig = byTopic.filter((d) => d.pvalue < 0.05).length;
        const strongest = byTopic[0];
        caption.textContent =
          `${sig}/${byTopic.length} topics show statistically significant uncertainty effects (p<0.05). ` +
          `Most negative association: ${strongest.topic} (${strongest.coef.toFixed(3)}). ` +
          `Interpretation: in topics with negative coefficients, higher policy uncertainty is associated with fewer interjections per speech (holding model controls constant).`;
      }
      return;
    }

    const u = (uncertaintyRows || [])
      .map((r) => ({
        model: r.model,
        coef: Number(r.coef),
        se: Number(r.se),
      }))
      .filter((r) => Number.isFinite(r.coef) && Number.isFinite(r.se));

    if (!u.length) {
      svg.innerHTML = `<text x="24" y="36" font-size="14" fill="#444">Uncertainty effect data unavailable.</text>`;
      if (caption) caption.textContent = "Uncertainty effect not available for this build.";
      return;
    }

    const W = 980;
    const H = 430;
    const margin = { top: 36, right: 42, bottom: 38, left: 200 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;
    const vals = u.flatMap((d) => [d.coef - 1.96 * d.se, d.coef + 1.96 * d.se, d.coef, 0]);
    const xMin = Math.min(...vals) - 0.02;
    const xMax = Math.max(...vals) + 0.02;
    const xScale = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
    const yScale = (i) => margin.top + (i + 0.5) * (innerH / u.length);

    let out = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fffdf8"></rect>`;
    out += `<line x1="${xScale(0)}" y1="${margin.top}" x2="${xScale(0)}" y2="${H - margin.bottom}" stroke="#988f82" stroke-dasharray="4 4"></line>`;
    const ticks = 6;
    for (let i = 0; i <= ticks; i += 1) {
      const v = xMin + (i / ticks) * (xMax - xMin);
      const x = xScale(v);
      out += `<line x1="${x}" y1="${H - margin.bottom}" x2="${x}" y2="${H - margin.bottom + 4}" stroke="#857d71"></line>`;
      out += `<text x="${x}" y="${H - margin.bottom + 16}" text-anchor="middle" font-size="11" fill="#6b6459">${v.toFixed(2)}</text>`;
    }

    const labels = { baseline: "Baseline", clustered: "Clustered SE", balanced: "Balanced weights" };
    u.forEach((d, i) => {
      const y = yScale(i);
      const lo = d.coef - 1.96 * d.se;
      const hi = d.coef + 1.96 * d.se;
      const color = d.coef < 0 ? "#c44e52" : "#4c72b0";
      out += `<line x1="${xScale(lo)}" y1="${y}" x2="${xScale(hi)}" y2="${y}" stroke="${color}" stroke-width="2.6"></line>`;
      out += `<circle cx="${xScale(d.coef)}" cy="${y}" r="5" fill="${color}"></circle>`;
      out += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="13" fill="#2f2b26">${labels[d.model] || d.model}</text>`;
      out += `<text x="${xScale(hi) + 8}" y="${y + 4}" font-size="12" fill="#4a453d">${d.coef.toFixed(3)}</text>`;
    });
    out += `<text x="${margin.left}" y="18" font-size="13" fill="#3b362f">Standardized uncertainty coefficient (95% CI)</text>`;
    svg.innerHTML = out;
    if (caption) {
      const avg = u.reduce((a, b) => a + b.coef, 0) / u.length;
      caption.textContent =
        `Overall uncertainty effect across model variants: average coefficient ${avg.toFixed(3)}. Negative values imply higher uncertainty is associated with fewer interjections per speech.`;
    }
  };

  const makeButton = (label) => {
    const b = document.createElement("button");
    b.className = `topic-pill${label === activeTopic ? " is-active" : ""}`;
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => {
      activeTopic = label;
      viewMode = "focus";
      Array.from(controls.querySelectorAll(".topic-pill")).forEach((el) => el.classList.remove("is-active"));
      b.classList.add("is-active");
      if (viewControls) {
        Array.from(viewControls.querySelectorAll(".topic-view-pill")).forEach((el) => {
          el.classList.toggle("is-active", el.dataset.mode === "focus");
        });
      }
      render();
    });
    controls.appendChild(b);
  };

  const makeViewButton = (label, mode) => {
    if (!viewControls) return;
    const b = document.createElement("button");
    b.className = `topic-view-pill${mode === viewMode ? " is-active" : ""}`;
    b.type = "button";
    b.dataset.mode = mode;
    b.textContent = label;
    b.addEventListener("click", () => {
      viewMode = mode;
      Array.from(viewControls.querySelectorAll(".topic-view-pill")).forEach((el) => el.classList.remove("is-active"));
      b.classList.add("is-active");
      render();
    });
    viewControls.appendChild(b);
  };

  if (viewControls) {
    viewControls.innerHTML = "";
    makeViewButton("Focus selected topic", "focus");
    makeViewButton("Compare all topics", "compare");
  }
  if (metricControls) {
    const makeMetric = (label, mode) => {
      const b = document.createElement("button");
      b.className = `topic-view-pill${mode === metricMode ? " is-active" : ""}`;
      b.type = "button";
      b.textContent = label;
      b.dataset.mode = mode;
      b.addEventListener("click", () => {
        metricMode = mode;
        Array.from(metricControls.querySelectorAll(".topic-view-pill")).forEach((el) => el.classList.remove("is-active"));
        b.classList.add("is-active");
        const showTopicControls = metricMode !== "uncertainty";
        if (controls) controls.style.display = showTopicControls ? "flex" : "none";
        if (viewControls) viewControls.style.display = showTopicControls ? "flex" : "none";
        render();
      });
      metricControls.appendChild(b);
    };
    metricControls.innerHTML = "";
    makeMetric("Gender gap trends", "trends");
    makeMetric("Overall heckling", "overall");
    makeMetric("Uncertainty effect", "uncertainty");
  }
  controls.innerHTML = "";
  topics.forEach((t) => makeButton(t));
  render();
}

function hydrateTopicTrendCallouts(rows) {
  if (!rows || !rows.length) return;
  const data = rows
    .map((r) => ({
      year: Number(r.year),
      topic: r.policy_topic_label,
      gap: Number(r.gap_pp_male_minus_female),
    }))
    .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.gap) && r.topic);
  if (!data.length) return;

  const byTopic = {};
  data.forEach((d) => {
    if (!byTopic[d.topic]) byTopic[d.topic] = [];
    byTopic[d.topic].push(d);
  });
  Object.keys(byTopic).forEach((k) => byTopic[k].sort((a, b) => a.year - b.year));

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const convergedRows = [];
  const volatileRows = [];
  const recentShiftRows = [];

  Object.entries(byTopic).forEach(([topic, arr]) => {
    if (arr.length < 2) return;

    const first = arr[0];
    const last = arr[arr.length - 1];
    const absChangeTowardZero = Math.abs(first.gap) - Math.abs(last.gap);
    convergedRows.push({ topic, value: absChangeTowardZero });

    const diffs = [];
    for (let i = 1; i < arr.length; i += 1) {
      diffs.push(Math.abs(arr[i].gap - arr[i - 1].gap));
    }
    volatileRows.push({
      topic,
      value: diffs.reduce((a, b) => a + b, 0) / Math.max(diffs.length, 1),
    });

    const early = arr.filter((d) => d.year >= 1998 && d.year <= 2007).map((d) => d.gap);
    const recent = arr.filter((d) => d.year >= 2016 && d.year <= 2025).map((d) => d.gap);
    if (early.length && recent.length) {
      const earlyMean = early.reduce((a, b) => a + b, 0) / early.length;
      const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
      recentShiftRows.push({ topic, value: recentMean - earlyMean });
    }
  });

  if (convergedRows.length) {
    const top = convergedRows.sort((a, b) => b.value - a.value)[0];
    set("topic-converged", `${top.topic} (${top.value >= 0 ? "+" : ""}${top.value.toFixed(2)} pp toward parity)`);
  }
  if (volatileRows.length) {
    const top = volatileRows.sort((a, b) => b.value - a.value)[0];
    set("topic-volatile", `${top.topic} (${top.value.toFixed(2)} pp avg year-to-year swing)`);
  }
  if (recentShiftRows.length) {
    const top = recentShiftRows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    set("topic-recent-shift", `${top.topic} (${top.value >= 0 ? "+" : ""}${top.value.toFixed(2)} pp: 2016-2025 vs 1998-2007)`);
  }
}

function drawPartyHeckleRates(rows) {
  const svg = document.getElementById("party-rate-svg");
  const controls = document.getElementById("party-rate-controls");
  const caption = document.getElementById("party-rate-caption");
  if (!svg || !controls) return;
  if (!rows || !rows.length) {
    svg.innerHTML = `<text x="24" y="36" font-size="14" fill="#444">Party trend data unavailable.</text>`;
    return;
  }

  const data = rows
    .map((r) => ({
      year: Number(r.year),
      party: r.party,
      nTurns: Number(r.n_turns),
      rate: Number(r.heckle_rate_per_100_turns),
    }))
    .filter((r) => r.party && Number.isFinite(r.year) && Number.isFinite(r.rate) && Number.isFinite(r.nTurns));

  const totals = {};
  data.forEach((d) => {
    if (!totals[d.party]) totals[d.party] = 0;
    totals[d.party] += d.nTurns;
  });
  const parties = Object.keys(totals)
    .sort((a, b) => totals[b] - totals[a])
    .slice(0, 8);

  const byParty = {};
  parties.forEach((p) => {
    byParty[p] = data.filter((d) => d.party === p).sort((a, b) => a.year - b.year);
  });

  const W = 980;
  const H = 400;
  const margin = { top: 20, right: 110, bottom: 34, left: 56 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const years = data.map((d) => d.year);
  const rates = data.map((d) => d.rate);
  const xMin = Math.min(...years);
  const xMax = Math.max(...years);
  const yMin = 0;
  const yMax = Math.ceil(Math.max(...rates) / 5) * 5;
  const xScale = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const yScale = (y) => margin.top + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;
  const colors = ["#4c72b0", "#c44e52", "#55a868", "#8172b3", "#dd8452", "#64b5cd", "#937860", "#ccb974"];
  const colorMap = {};
  parties.forEach((p, i) => {
    colorMap[p] = colors[i % colors.length];
  });

  let activeParties = new Set(parties.slice(0, 4));
  if (!activeParties.size) activeParties = new Set(parties);

  const render = () => {
    let out = `<rect x="0" y="0" width="${W}" height="${H}" fill="#fffdf8"></rect>`;
    const yTicks = Math.max(4, Math.round(yMax / 5));
    for (let i = 0; i <= yTicks; i += 1) {
      const v = (i / yTicks) * yMax;
      const y = yScale(v);
      out += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="#eee6d8"></line>`;
      out += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b6459">${v.toFixed(0)}</text>`;
    }
    const xTicks = Math.min(8, xMax - xMin);
    for (let i = 0; i <= xTicks; i += 1) {
      const v = Math.round(xMin + (i / xTicks) * (xMax - xMin));
      const x = xScale(v);
      out += `<line x1="${x}" y1="${H - margin.bottom}" x2="${x}" y2="${H - margin.bottom + 4}" stroke="#857d71"></line>`;
      out += `<text x="${x}" y="${H - margin.bottom + 16}" text-anchor="middle" font-size="11" fill="#6b6459">${v}</text>`;
    }

    parties.forEach((party) => {
      const series = byParty[party] || [];
      if (!series.length) return;
      const active = activeParties.has(party);
      const opacity = active ? 0.96 : 0.12;
      const points = series.map((d) => `${xScale(d.year)},${yScale(d.rate)}`).join(" ");
      out += `<polyline fill="none" stroke="${colorMap[party]}" stroke-width="${active ? 3 : 2}" opacity="${opacity}" points="${points}"></polyline>`;
    });
    // In-chart legend so active party labels are always visible.
    const activeList = parties.filter((p) => activeParties.has(p));
    if (activeList.length) {
      const legendX = W - margin.right + 8;
      const legendY0 = margin.top + 10;
      const rowH = 14;
      activeList.forEach((party, i) => {
        const y = legendY0 + i * rowH;
        out += `<line x1="${legendX}" y1="${y}" x2="${legendX + 12}" y2="${y}" stroke="${colorMap[party]}" stroke-width="3"></line>`;
        out += `<text x="${legendX + 16}" y="${y + 3}" font-size="11" fill="#2f2b26">${party}</text>`;
      });
    }
    out += `<text x="${margin.left}" y="14" font-size="13" fill="#3b362f">Heckling rate (interjections per 100 turns)</text>`;
    svg.innerHTML = out;

    if (caption) {
      const shown = parties.filter((p) => activeParties.has(p));
      caption.textContent = `${shown.length} party series shown. Click party buttons to compare trends.`;
    }
  };

  const makeBtn = (party) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `topic-view-pill${activeParties.has(party) ? " is-active" : ""}`;
    b.textContent = party;
    b.title = PARTY_LABELS[party] || party;
    b.addEventListener("click", () => {
      if (activeParties.has(party)) {
        activeParties.delete(party);
      } else {
        activeParties.add(party);
      }
      if (activeParties.size === 0) activeParties = new Set([party]);
      Array.from(controls.querySelectorAll(".topic-view-pill")).forEach((el) => {
        el.classList.toggle("is-active", activeParties.has(el.textContent));
      });
      render();
    });
    controls.appendChild(b);
  };

  controls.innerHTML = "";
  parties.forEach((p) => makeBtn(p));
  render();
}

function setupMpLookup(hecklerRows, heckledRows) {
  const input = document.getElementById("mp-lookup-input");
  const clearBtn = document.getElementById("mp-lookup-clear");
  const result = document.getElementById("mp-lookup-result");
  const body = document.getElementById("mp-top-table-body");
  const sortBtns = Array.from(document.querySelectorAll(".mp-sort-btn"));
  const modeBtns = Array.from(document.querySelectorAll("#mp-mode-controls .topic-view-pill"));
  const modeCaption = document.getElementById("mp-mode-caption");
  if (!input || !clearBtn || !result || !body) return;
  if (!hecklerRows || !hecklerRows.length) {
    result.textContent = "MP summary data unavailable.";
    return;
  }

  const parseRows = (rows) =>
    (rows || [])
    .map((r) => ({
      uniqueID: r.uniqueID,
      name: r.name,
      party: r.party,
      firstYear: Number(r.first_year),
      lastYear: Number(r.last_year),
      nTurns: Number(r.n_turns),
      nHeckles: Number(r.n_heckles),
      rate: Number(r.heckle_rate_per_100_turns),
    }))
    .filter(
      (r) =>
        r.uniqueID &&
        r.name &&
        Number.isFinite(r.nTurns) &&
        Number.isFinite(r.nHeckles) &&
        Number.isFinite(r.rate)
    );

  const datasetMap = {
    hecklers: parseRows(hecklerRows),
    heckled: parseRows(heckledRows),
  };
  let mode = "hecklers";
  let baseRows = datasetMap[mode].filter((d) => d.nTurns >= 200).sort((a, b) => b.nHeckles - a.nHeckles);

  let sortKey = "nHeckles";
  let sortDir = "desc";
  let matches = null;

  const sortRows = (arr) => {
    const out = [...arr];
    out.sort((a, b) => {
      const av = Number(a[sortKey]);
      const bv = Number(b[sortKey]);
      if (av === bv) return b.nHeckles - a.nHeckles;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return out;
  };

  const setSortUi = () => {
    sortBtns.forEach((btn) => {
      const active = btn.dataset.sort === sortKey;
      btn.classList.toggle("is-active", active);
      if (active) {
        const arrow = sortDir === "desc" ? " ↓" : " ↑";
        const base = btn.textContent.replace(/[↑↓]\s*$/, "").trim();
        btn.textContent = `${base}${arrow}`;
      } else {
        btn.textContent = btn.textContent.replace(/[↑↓]\s*$/, "").trim();
      }
    });
  };

  const modeMeta = () => {
    if (mode === "heckled") {
      return {
        intro: "Showing MPs most frequently heckled (speeches receiving any interjection).",
        rankLabel: "by speeches heckled",
        countLabel: "speeches heckled",
      };
    }
    return {
      intro: "Showing MPs who interject most often.",
      rankLabel: "by total heckles",
      countLabel: "heckles",
    };
  };

  const renderTable = (rowsToShow, rankById, hitIds = new Set()) => {
    body.innerHTML = "";
    rowsToShow.forEach((d) => {
      const tr = document.createElement("tr");
      if (hitIds.has(d.uniqueID)) tr.classList.add("is-hit");
      tr.innerHTML = `
        <td>${rankById.get(d.uniqueID) || "-"}</td>
        <td>${d.name}</td>
        <td title="${PARTY_LABELS[d.party] || d.party}">${d.party}</td>
        <td>${Number.isFinite(d.firstYear) && Number.isFinite(d.lastYear) ? `${d.firstYear}-${d.lastYear}` : "-"}</td>
        <td>${d.nTurns.toLocaleString("en-US")}</td>
        <td>${d.nHeckles.toLocaleString("en-US")}</td>
        <td>${d.rate.toFixed(1)}</td>
      `;
      body.appendChild(tr);
    });
  };

  const renderCurrent = () => {
    const target = matches && matches.length ? matches : baseRows;
    const sorted = sortRows(target);
    const rankById = new Map(sorted.map((d, i) => [d.uniqueID, i + 1]));
    const hitIds = matches && matches.length ? new Set(sorted.slice(0, 5).map((d) => d.uniqueID)) : new Set();
    renderTable(sorted.slice(0, 30), rankById, hitIds);
  };

  const updateSearch = () => {
    const q = input.value.trim().toLowerCase();
    const meta = modeMeta();
    if (!q) {
      matches = null;
      result.textContent = "Type to search the MP profile table.";
      if (modeCaption) modeCaption.textContent = meta.intro;
      renderCurrent();
      return;
    }
    matches = baseRows.filter(
      (d) => d.name.toLowerCase().includes(q) || d.uniqueID.toLowerCase().includes(q)
    );
    if (!matches.length) {
      result.textContent = `No MP match for "${input.value.trim()}".`;
      renderCurrent();
      return;
    }
    const heckleRank = new Map(baseRows.sort((a, b) => b.nHeckles - a.nHeckles).map((d, i) => [d.uniqueID, i + 1]));
    const top = matches.sort(
      (a, b) => (heckleRank.get(a.uniqueID) || 999999) - (heckleRank.get(b.uniqueID) || 999999)
    )[0];
    result.textContent =
      `${top.name} (${top.party}) — rank #${heckleRank.get(top.uniqueID)} ${meta.rankLabel}, ` +
      `${top.nHeckles.toLocaleString("en-US")} ${meta.countLabel} across ${top.nTurns.toLocaleString("en-US")} turns ` +
      `(${top.rate.toFixed(1)} per 100 turns).`;
    if (modeCaption) modeCaption.textContent = meta.intro;
    renderCurrent();
  };

  sortBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (!key) return;
      if (sortKey === key) {
        sortDir = sortDir === "desc" ? "asc" : "desc";
      } else {
        sortKey = key;
        sortDir = "desc";
      }
      setSortUi();
      renderCurrent();
    });
  });

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode === "heckled" ? "heckled" : "hecklers";
      baseRows = datasetMap[mode].filter((d) => d.nTurns >= 200).sort((a, b) => b.nHeckles - a.nHeckles);
      matches = null;
      input.value = "";
      modeBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      const meta = modeMeta();
      if (modeCaption) modeCaption.textContent = meta.intro;
      result.textContent = "Type to search the MP profile table.";
      renderCurrent();
    });
  });

  input.addEventListener("input", updateSearch);
  clearBtn.addEventListener("click", () => {
    input.value = "";
    updateSearch();
  });
  setSortUi();
  if (modeCaption) modeCaption.textContent = modeMeta().intro;
  renderCurrent();
}

async function bootstrap() {
  setupScrolly();
  await hydrateStats();
  await hydrateTopicCallouts();
  try {
    const topicRows = await loadCsv("assets/data/policy_topic_gap_over_time.csv");
    let topicLongRows = [];
    let uncertaintyRows = [];
    let uncertaintyTopicRows = [];
    try {
      topicLongRows = await loadCsv("assets/data/policy_topic_gap_over_time_long.csv");
    } catch {
      topicLongRows = [];
    }
    try {
      uncertaintyRows = await loadCsv("assets/data/uncertainty_effects_table.csv");
    } catch {
      uncertaintyRows = [];
    }
    try {
      uncertaintyTopicRows = await loadCsv("assets/data/uncertainty_topic_effects.csv");
    } catch {
      uncertaintyTopicRows = [];
    }
    drawPolicyTopicInteractive(topicRows, topicLongRows, uncertaintyRows, uncertaintyTopicRows);
    hydrateTopicTrendCallouts(topicRows);
  } catch (err) {
    const svg = document.getElementById("topic-time-svg");
    const fallback = document.getElementById("topic-time-fallback");
    const caption = document.getElementById("topic-chart-caption");
    if (svg) svg.style.display = "none";
    if (fallback) fallback.style.display = "block";
    if (caption) {
      caption.textContent =
        "Interactive topic data could not be loaded. If you are opening this page as file://, use a local web server instead.";
    }
    console.error("Topic explorer failed to initialize", err);
  }
  try {
    const coefRows = await loadCsv("assets/data/model_coefficients.csv");
    setupModelToggle(coefRows);
  } catch (err) {
    setupFallbackCoefToggle();
    console.error("Model coefficients failed to initialize", err);
  }
  try {
    const partyRows = await loadCsv("assets/data/party_heckle_rate_by_year.csv");
    drawPartyHeckleRates(partyRows);
  } catch (err) {
    const svg = document.getElementById("party-rate-svg");
    const caption = document.getElementById("party-rate-caption");
    if (svg) {
      svg.innerHTML = `<text x="24" y="36" font-size="14" fill="#444">Party trend data unavailable. Check assets/data/party_heckle_rate_by_year.csv.</text>`;
    }
    if (caption) {
      caption.textContent =
        "Party trends could not be loaded. If you are opening this page as file://, use a local web server.";
    }
    console.error("Party chart failed to initialize", err);
  }
  try {
    const mpRows = await loadCsv("assets/data/member_heckle_summary.csv");
    let mpHeckledRows = [];
    try {
      mpHeckledRows = await loadCsv("assets/data/member_heckled_summary.csv");
    } catch {
      mpHeckledRows = [];
    }
    setupMpLookup(mpRows, mpHeckledRows);
  } catch (err) {
    const result = document.getElementById("mp-lookup-result");
    if (result) {
      result.textContent =
        "MP lookup data unavailable. Check assets/data/member_heckle_summary.csv (or open via local web server).";
    }
    console.error("MP lookup failed to initialize", err);
  }
}

bootstrap().catch(() => {
  // Keep page usable even if data fetch fails in local previews.
});
