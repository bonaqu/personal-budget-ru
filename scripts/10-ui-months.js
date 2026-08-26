Object.assign(UI, {
  renderMonthsOverview() {
    const root = Utils.$("monthsOverviewStats");
    const monthKeys = Store.getMonthKeys();
    if (!root) {
      return;
    }
    root.replaceChildren();
    if (!monthKeys.length) {
      return;
    }

    const statsList = monthKeys.map((monthKey) => Store.statsForMonth(monthKey));
    const profitable = statsList.filter((item) => item.totals.balance >= 0).length;
    const bestMonth = statsList.reduce((best, item) => (!best || item.totals.balance > best.totals.balance ? item : best), null);
    const selectedMonth = statsList.find((item) => item.monthKey === Store.detailMonth) || statsList[0];

    [
      {
        label: "В истории",
        value: `${monthKeys.length} мес.`,
        note: `В плюсе ${Utils.formatCount(profitable, "месяц", "месяца", "месяцев")}`
      },
        {
          label: "Лучший чистый итог",
          value: bestMonth ? Utils.formatMoney(bestMonth.totals.balance) : "0 ₽",
          note: bestMonth ? Utils.monthLabel(bestMonth.monthKey) : "Еще без данных",
          title: bestMonth
            ? `Месяц с самым сильным положительным итогом: ${Utils.monthLabel(bestMonth.monthKey)}`
            : "Появится, когда накопится история по месяцам"
        },
        {
          label: "Лидер расходов",
          value: selectedMonth?.topCategory ? selectedMonth.topCategory.name : "Пока без лидера",
          note: selectedMonth?.topCategory
            ? Utils.formatMoney(selectedMonth.topCategoryAmount)
            : "Главная статья расходов выбранного месяца",
          title: selectedMonth?.topCategory
            ? `Категория с самым большим вкладом в расходы месяца: ${selectedMonth.topCategory.name}`
            : "Появится после первых расходов в выбранном месяце"
        }
      ].forEach((item) => {
        const card = Utils.createElement("div", "month-overview-stat");
        card.title = item.title || item.note;
        card.append(
          Utils.createElement("span", "month-overview-stat__label", item.label),
          Utils.createElement("strong", "month-overview-stat__value", item.value),
        Utils.createElement("small", "month-overview-stat__note", item.note)
      );
      root.appendChild(card);
    });
  },

  renderMonthsTable() {
    const root = Utils.$("monthsTable");
    const monthKeys = Store.getMonthKeys();
    if (!root) {
      return;
    }
    if (!monthKeys.length) {
      root.replaceChildren(Utils.createElement("div", "empty-state", "Архив по месяцам появится после первых операций."));
      return;
    }

    const fragment = document.createDocumentFragment();
    monthKeys.forEach((monthKey) => {
      const stats = Store.statsForMonth(monthKey);
      const netClass = stats.totals.balance >= 0 ? "amount-positive" : "amount-negative";
      const focusLabel = stats.topCategory
        ? `${stats.topCategory.name} • ${Utils.formatMoney(stats.topCategoryAmount)}`
        : stats.topExpense
          ? stats.topExpense.description
          : "Пока без трат";

      const button = Utils.createElement("button", `month-table__row month-table__row--compact ${Store.detailMonth === monthKey ? "is-active" : ""}`);
      button.type = "button";
      button.dataset.action = "open-month";
      button.dataset.month = monthKey;

      const headline = Utils.createElement("div", "month-table__headline");
      const title = Utils.createElement("div", "month-table__title");
      const meta = Utils.createElement("div", "month-table__meta");
      title.appendChild(Utils.createElement("strong", "", Utils.monthLabel(monthKey)));
      [
        Utils.formatCount(stats.operations, "операция", "операции", "операций"),
        `${Utils.formatPercent(Math.max(0, stats.savingsRate))} накопления`,
        `Средний чек ${Utils.formatMoney(stats.averageCheck)}`
      ].forEach((text) => meta.appendChild(Utils.createElement("span", "", text)));
      title.appendChild(meta);

        const result = Utils.createElement("div", "month-table__result");
        result.title = "Чистый итог месяца после всех доходов и расходов";
        result.append(
          Utils.createElement("span", "month-table__result-label", "Чистый итог"),
          Utils.createElement("strong", netClass, Utils.formatMoney(stats.totals.balance))
        );
      headline.append(title, result);

      const totals = Utils.createElement("div", "month-table__totals");
      [
        ["Доход", Utils.formatMoney(stats.totals.income), "amount-positive"],
        ["Расход", Utils.formatMoney(stats.totals.expense), "amount-negative"],
        ["Остаток", Utils.formatMoney(stats.finalBalance), ""]
      ].forEach(([label, value, tone]) => {
        const card = Utils.createElement("div", "month-mini-stat");
        card.append(
          Utils.createElement("span", "", label),
          Utils.createElement("strong", tone, value)
        );
        totals.appendChild(card);
      });

        const focus = Utils.createElement("div", "month-table__focus");
        focus.title = stats.topExpense ? `Лидер расходов этого месяца: ${focusLabel}` : focusLabel;
        focus.append(
          Utils.createElement("span", "month-table__focus-label", "Лидер расходов"),
          Utils.createElement("strong", "month-table__focus-value", Utils.truncateSingleLine(focusLabel, 54))
        );

      button.append(headline, totals, focus);
      fragment.appendChild(button);
    });
    root.replaceChildren(fragment);
  },

  renderOverviewExpenseLegend() {
    const root = Utils.$("overviewCategoryLegend");
    if (!root) {
      return;
    }
    const breakdown = Store.expenseBreakdown(Store.viewMonth).slice(0, 5);
    const totalExpense = Store.statsForMonth(Store.viewMonth).totals.expense;
    const signature = breakdown.length
      ? JSON.stringify({
        totalExpense,
        categories: breakdown.map((item) => ({
          id: item.category.id,
          amount: item.amount
        }))
      })
      : "empty";
    if (root.dataset.renderSignature === signature) {
      return;
    }
    if (!breakdown.length) {
      root.replaceChildren(Utils.createElement("div", "empty-state empty-state--compact", "Главные категории появятся после первых трат месяца."));
      root.dataset.renderSignature = signature;
      return;
    }
    const fragment = document.createDocumentFragment();
    breakdown.forEach((item) => {
      const usage = totalExpense > 0 ? Math.min(100, (item.amount / totalExpense) * 100) : 0;
      const progressWidth = `${Math.max(10, Math.round(usage))}%`;
      const shareLabel = totalExpense > 0
        ? `${Utils.formatPercent(usage)} от всех трат`
        : "Расходов пока нет";
      const card = Utils.createElement("article", "budget-limit-card budget-limit-card--focus");
      card.title = `${item.category.name}: ${Utils.formatMoney(item.amount)}`;
      card.style.setProperty("--budget-card-accent", item.category.color);
      card.innerHTML = `
        <div class="budget-limit-card__head">
          <div class="budget-limit-card__category">
            <span class="budget-limit-card__swatch" style="background:${item.category.color}"></span>
            <strong title="${Utils.escapeHtml(item.category.name)}">${Utils.escapeHtml(item.category.name)}</strong>
          </div>
          <span class="budget-limit-card__amount">${Utils.formatMoney(item.amount)}</span>
        </div>
        <div class="budget-limit-card__bar" aria-hidden="true">
          <span style="width:${progressWidth}; background:${item.category.color}"></span>
        </div>
        <small>${shareLabel}</small>
      `;
      fragment.appendChild(card);
    });
    root.replaceChildren(fragment);
    root.dataset.renderSignature = signature;
  },

  renderMonthBalanceLegend(colors) {
    const root = Utils.$("monthBalanceLegend");
    if (!root) {
      return;
    }
    const items = [
      { label: "\u0411\u0430\u043B\u0430\u043D\u0441", color: colors.line },
      { label: "\u0427\u0438\u0441\u0442\u043E\u0435 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435 \u0437\u0430 \u0434\u0435\u043D\u044C", color: colors.gain }
    ];
    const signature = JSON.stringify(items);
    if (root.dataset.renderSignature === signature) {
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const node = Utils.createElement("div", "month-balance-legend__item");
      const dot = Utils.createElement("span", "month-balance-legend__dot");
      dot.style.background = item.color;
      const label = Utils.createElement("span", "month-balance-legend__label", item.label);
      node.append(dot, label);
      fragment.appendChild(node);
    });
    root.replaceChildren(fragment);
    root.dataset.renderSignature = signature;
  },

  renderMonthBalanceChart() {
    const canvas = Utils.$("monthBalanceChart");
    if (typeof window.Chart === "undefined" || !canvas) {
      return;
    }
    const stats = Store.statsForMonth(Store.viewMonth);
    const isCurrentMonth = Store.viewMonth === Utils.monthKey(new Date());
    const colors = Utils.themePalette();

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const gradientHeight = canvas.parentElement?.clientHeight || canvas.height || 260;
    const gradient = context.createLinearGradient(0, 0, 0, gradientHeight);
    gradient.addColorStop(0, colors.fillTop);
    gradient.addColorStop(1, colors.fillBottom);
    this.renderMonthBalanceLegend(colors);

    const labels = stats.trend.map((point) => point.day);
    const todayLinePlugin = {
      id: "monthTodayMarker",
      afterDatasetsDraw: (chart) => {
        if (!isCurrentMonth) {
          return;
        }
        const todayIndex = Math.min(new Date().getDate(), stats.daysInMonth) - 1;
        const xScale = chart.scales.x;
        const area = chart.chartArea;
        if (!xScale || !area || todayIndex < 0) {
          return;
        }
        const x = xScale.getPixelForValue(todayIndex);
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = colors.marker;
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colors.textSoft;
        ctx.font = "600 11px Inter, sans-serif";
        ctx.fillText("Сегодня", Math.min(x + 6, area.right - 46), area.top + 14);
        ctx.restore();
      }
    };

    if (this.charts.monthBalance) {
      this.charts.monthBalance.destroy();
    }

    this.charts.monthBalance = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Чистое движение за день",
            yAxisID: "delta",
            data: stats.trend.map((point) => point.delta),
            backgroundColor: stats.trend.map((point) => point.delta >= 0 ? colors.gain : colors.loss),
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 10,
            order: 2
          },
          {
            type: "line",
            label: "Баланс",
            yAxisID: "balance",
            data: stats.trend.map((point) => point.balance),
            borderColor: colors.line,
            backgroundColor: gradient,
            fill: true,
            tension: 0.34,
            borderWidth: 2.5,
            pointBackgroundColor: colors.line,
            pointBorderWidth: 0,
            pointHoverRadius: 4,
            pointRadius: (ctx) => {
              const day = ctx.dataIndex + 1;
              return day === stats.minBalanceDay || day === stats.currentDay || day === stats.daysInMonth ? 3 : 0;
            },
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: colors.bgSolid,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1,
            callbacks: {
              title: (items) => `День ${items[0]?.label || ""}`,
              afterBody: (items) => {
                const point = stats.trend[items[0]?.dataIndex ?? 0];
                return [
                  `Доходы: ${Utils.formatMoney(point.income)}`,
                  `Расходы: ${Utils.formatMoney(point.expense)}`
                ];
              },
              label: (ctx) => `${ctx.dataset.label}: ${Utils.formatMoney(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: colors.textSoft,
              autoSkip: false,
              maxRotation: 0,
              callback: (value, index) => {
                const day = labels[index];
                return day === 1 || day === stats.daysInMonth || day % 5 === 0 ? day : "";
              }
            },
            grid: {
              display: false
            }
          },
          balance: {
            position: "left",
            ticks: {
              color: colors.text,
              callback: (value) => Utils.formatMoney(value)
            },
            grid: {
              color: colors.grid
            }
          },
          delta: {
            position: "right",
            display: false,
            grid: {
              display: false
            }
          }
        }
      },
      plugins: [todayLinePlugin]
    });
    this.scheduleChartResize();
  },

    renderMonthDetail() {
      const monthKey = Store.detailMonth;
      const stats = Store.statsForMonth(monthKey);
      const topCategories = Store.expenseBreakdown(monthKey).slice(0, 4);
      const title = Utils.$("monthDetailTitle");
    const root = Utils.$("monthDetail");
    const toolbar = Utils.$("monthDetailToolbar");
    if (title) {
      title.textContent = Utils.monthLabel(monthKey);
    }
    if (!root) {
      return;
    }
    if (toolbar) {
      toolbar.replaceChildren();
      toolbar.hidden = true;
    }
    root.replaceChildren();

      const metricGrid = Utils.createElement("div", "month-detail__hero");
      [
        ["Чистый итог", Utils.formatMoney(stats.totals.balance), stats.totals.balance >= 0 ? "amount-positive" : "amount-negative", "Разница между всеми доходами и расходами выбранного месяца"],
        ["Финал месяца", Utils.formatMoney(stats.finalBalance), "", "Сумма, с которой месяц завершился"],
        ["Доходы", Utils.formatMoney(stats.totals.income), "amount-positive", "Все поступления выбранного месяца"],
        ["Расходы", Utils.formatMoney(stats.totals.expense), "amount-negative", "Все списания выбранного месяца"],
        ["Операций", String(stats.operations), "", "Сколько операций попало в выбранный месяц"],
        ["Стартовый баланс", Utils.formatMoney(stats.startBalance), "", "С каким балансом начался выбранный месяц"]
      ].forEach(([label, value, valueClass, title]) => {
        const card = Utils.createElement("article", "month-detail__hero-card");
        card.title = title;
        card.append(
          Utils.createElement("span", "month-detail__hero-label", label),
          Utils.createElement("strong", valueClass, value)
        );
      metricGrid.appendChild(card);
    });

    const body = Utils.createElement("div", "month-detail__body");

    const summaryCard = Utils.createElement("article", "month-detail__card month-detail__card--facts");
    summaryCard.appendChild(Utils.createElement("strong", "", "Ключевые ориентиры"));
    const summaryList = Utils.createElement("div", "month-detail__list");
    [
      ["Накопление", Utils.formatPercent(Math.max(0, stats.savingsRate))],
      ["Средний чек", Utils.formatMoney(stats.averageCheck)],
      ["Средний расход в день", Utils.formatMoney(stats.averageExpensePerDay)],
      ["Долги", Utils.formatMoney(stats.totals.debt)],
      ["Обязательные", Utils.formatMoney(stats.totals.recurring)],
      ["Минимальный баланс", Utils.formatMoney(stats.minBalance)],
      ["Крупнейший доход", stats.topIncome ? `${stats.topIncome.description} • ${Utils.formatMoney(stats.topIncome.amount)}` : "Пока без доходов"],
      ["Крупнейший расход", stats.topExpense ? `${stats.topExpense.description} • ${Utils.formatMoney(stats.topExpense.amount)}` : "Пока без расходов"]
    ].forEach(([label, value]) => {
      const isOperationLabel = label === "Крупнейший доход" || label === "Крупнейший расход";
      const row = Utils.createElement(
        "div",
        `month-detail__metric month-detail__metric--row${isOperationLabel ? " month-detail__metric--operation" : ""}`
      );
      if (isOperationLabel) {
        row.title = value;
      }
      const valueNode = Utils.createElement("strong", "", value);
      if (isOperationLabel) {
        valueNode.title = value;
      }
      row.append(
        Utils.createElement("span", "", label),
        valueNode
      );
      summaryList.appendChild(row);
    });
    summaryCard.appendChild(summaryList);

    const topCard = Utils.createElement("article", "month-detail__card month-detail__card--structure");
    topCard.appendChild(Utils.createElement("strong", "", "Главные статьи расходов"));
    const topList = Utils.createElement("div", "month-detail__categories");
    if (topCategories.length) {
      const totalExpense = stats.totals.expense || 1;
      topCategories.forEach((item) => {
        const row = Utils.createElement("div", "month-detail__category");
        const head = Utils.createElement("div", "month-detail__category-head");
        const info = Utils.createElement("div", "month-detail__category-info");
        const swatch = Utils.createElement("span", "month-detail__category-swatch");
        swatch.style.background = item.category?.color || "#8b949e";
        info.append(
          swatch,
          Utils.createElement("span", "month-detail__category-name", item.category?.name || "Категория")
        );
        head.append(
          info,
          Utils.createElement("strong", "", Utils.formatMoney(item.amount))
        );

        const bar = Utils.createElement("div", "month-detail__category-bar");
        const fill = Utils.createElement("span", "month-detail__category-fill");
        fill.style.width = `${Math.max(8, (item.amount / totalExpense) * 100)}%`;
        fill.style.background = item.category?.color || "#8b949e";
        bar.appendChild(fill);

        const meta = Utils.createElement("div", "month-detail__category-meta");
        meta.appendChild(Utils.createElement("span", "", `${Utils.formatPercent((item.amount / totalExpense) * 100)} от расходов`));

        row.append(head, bar, meta);
        topList.appendChild(row);
      });
    } else {
      topList.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "Структура расходов появится после первых трат."));
    }
    topCard.appendChild(topList);

    body.append(summaryCard, topCard);
    root.append(metricGrid, body);
  },

});
