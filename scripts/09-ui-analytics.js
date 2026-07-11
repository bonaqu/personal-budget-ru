Object.assign(UI, {
  renderInsights() {
    const current = Store.statsForMonth(Store.viewMonth);
    const previous = Store.statsForMonth(Store.previousMonthKey(Store.viewMonth));
    const recurringShare = current.totals.expense ? (current.totals.recurring / current.totals.expense) * 100 : 0;
    const debtShare = current.totals.expense ? (current.totals.debt / current.totals.expense) * 100 : 0;
    const deltaExpense = previous.totals.expense ? ((current.totals.expense - previous.totals.expense) / previous.totals.expense) * 100 : 0;
    const cards = [
      {
        label: "Прогноз расхода",
        value: Utils.formatMoney(current.burnRateProjection),
        description: "Если сохранить текущий темп трат до конца месяца"
      },
      {
        label: "Средний чек",
        value: Utils.formatMoney(current.averageCheck),
        description: "Средний размер одной расходной операции"
      },
      {
        label: "Доля регулярных",
        value: Utils.formatPercent(recurringShare),
        description: "Сколько в расходах занимают повторяющиеся платежи"
      },
      {
        label: "Изменение к прошлому месяцу",
        value: `${deltaExpense >= 0 ? "+" : ""}${Utils.formatPercent(Math.abs(deltaExpense))}`,
        description: "Как изменились расходы относительно прошлого месяца"
      },
      {
        label: "Доля долгов",
        value: Utils.formatPercent(debtShare),
        description: "Сколько ушло на долги, кредиты и рассрочки"
      },
      {
        label: "Концентрация категории",
        value: Utils.formatPercent(current.concentration),
        description: current.topCategory ? `Главный драйвер расходов: ${current.topCategory.name}` : "Появится, как только появятся расходы"
      }
    ];

    Utils.$("insightGrid").innerHTML = cards.map((card) => `
      <article class="insight-card">
        <span>${Utils.escapeHtml(card.label)}</span>
        <strong>${Utils.escapeHtml(card.value)}</strong>
        <small>${Utils.escapeHtml(card.description)}</small>
      </article>
    `).join("");
    App.runAfterNextPaint(() => this.syncSettingsLayout(), 2);
  },

  renderCashflowStrip() {
    const root = Utils.$("cashflowStrip");
    if (!root) {
      return;
    }
    const series = Store.monthlySeries(6);
    const current = Store.statsForMonth(Store.viewMonth);
    const bestNetMonth = series.reduce((best, item) => (item.balance > (best?.balance ?? -Infinity) ? item : best), null);
    const worstExpenseMonth = series.reduce((worst, item) => (item.expense > (worst?.expense ?? -Infinity) ? item : worst), null);
    const averageMonthlyFlow = series.length
      ? Utils.roundMoney(series.reduce((sum, item) => sum + item.balance, 0) / series.length)
      : 0;

    const cards = [
        {
          label: "Лучший месяц",
          value: bestNetMonth ? Utils.formatMoney(bestNetMonth.balance) : "0 ₽",
          note: bestNetMonth ? bestNetMonth.label : "Пока без данных"
        },
        {
          label: "Самый затратный",
        value: worstExpenseMonth ? Utils.formatMoney(worstExpenseMonth.expense) : "0 ₽",
        note: worstExpenseMonth ? worstExpenseMonth.label : "Пока без данных"
      },
      {
        label: "Средний чистый поток",
        value: Utils.formatMoney(averageMonthlyFlow),
        note: `${current.operations} операций в текущем месяце`
      }
    ];

    root.innerHTML = cards.map((item) => `
      <article class="cashflow-strip__card">
        <span>${Utils.escapeHtml(item.label)}</span>
        <strong>${Utils.escapeHtml(item.value)}</strong>
        <small>${Utils.escapeHtml(item.note)}</small>
      </article>
    `).join("");
  },

  renderGoals() {
    const root = Utils.$("goalList");
    if (!root) {
      return;
    }
    const goals = (Store.data.settings.goals || [])
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((goal) => Store.goalProgress(goal, Store.viewMonth))
      .filter(Boolean);
    root.replaceChildren();

    const fragment = document.createDocumentFragment();
    if (!goals.length) {
      const emptyCard = Utils.createElement("article", "goal-card goal-card--empty");
      emptyCard.append(
        Utils.createElement("strong", "", "Цели и копилки появятся здесь"),
        Utils.createElement("p", "goal-card__note", "Добавьте цель, чтобы видеть прогресс накопления рядом с аналитикой месяца.")
      );
      fragment.appendChild(emptyCard);
    }

    goals.forEach((goal) => {
      const card = Utils.createElement("article", "goal-card");
      card.style.setProperty("--goal-color", goal.color);
      card.classList.toggle("goal-card--complete", goal.progress >= 100);
      this.bindPointerGlow(card);

      const head = Utils.createElement("div", "goal-card__head");
      const titleBox = Utils.createElement("div", "goal-card__title");
      const title = Utils.createElement("strong", "", goal.name);
      const meta = Utils.createElement(
        "small",
        "",
        goal.mode === "saved"
            ? "Считается вручную"
            : "Считается от остатка месяца"
      );
      titleBox.append(title, meta);
      head.append(titleBox);

      const progress = Utils.createElement("div", "goal-progress");
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", `Прогресс цели «${goal.name}»`);
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, Math.round(goal.progress)))));
      const progressFill = Utils.createElement("div", "goal-progress__fill");
      progressFill.style.width = `${Math.min(100, goal.progress)}%`;
      const target = Utils.createElement("strong", "goal-card__target", Utils.formatMoney(goal.target));
      progress.append(progressFill, target);

      const metrics = Utils.createElement("div", "goal-card__meta");
      metrics.append(
        Utils.createElement("span", "", `Накоплено ${Utils.formatMoney(goal.currentAmount)}`),
        Utils.createElement("span", "", `Осталось ${Utils.formatMoney(goal.remaining)}`),
        Utils.createElement("span", "", `${Utils.formatPercent(goal.progress)} выполнения`)
      );

      card.append(head, progress, metrics);
      if (goal.note) {
        card.appendChild(Utils.createElement("p", "goal-card__note", goal.note));
      }

      const actions = Utils.createElement("div", "goal-card__actions");
      const editButton = Utils.createElement("button", "chip-btn", "Изменить");
      editButton.type = "button";
      editButton.dataset.action = "edit-goal";
      editButton.dataset.id = goal.id;
      const deleteButton = Utils.createElement("button", "chip-btn", "Удалить");
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-goal";
      deleteButton.dataset.id = goal.id;
      actions.append(editButton, deleteButton);
      card.append(actions);
      fragment.appendChild(card);
    });

    const addTile = Utils.createElement("button", "goal-card goal-card--adder");
    addTile.type = "button";
    addTile.dataset.action = "create-goal-inline";
    addTile.append(
      Utils.createElement("strong", "", "+ Добавить цель"),
      Utils.createElement("span", "", "Копилка, резерв или крупная покупка")
    );
    fragment.appendChild(addTile);

    root.appendChild(fragment);
  },

  renderForecast() {
    const root = Utils.$("forecastPanel");
    if (!root) {
      return;
    }

    const forecast = Store.forecastNextMonth(Store.viewMonth);
    const projectedNet = Utils.roundMoney(forecast.averageIncome - forecast.averageExpense);
    root.replaceChildren();

    const shell = Utils.createElement("div", "forecast-v3");
    const content = Utils.createElement("section", "forecast-v3__content");
    const main = Utils.createElement("section", "forecast-v3__main");
    const heroMain = Utils.createElement("article", "forecast-v3__hero-main");
    heroMain.append(
      Utils.createElement("span", "forecast-v3__eyebrow", "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043D\u0430 \u043A\u043E\u043D\u0435\u0446 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u043C\u0435\u0441\u044F\u0446\u0430"),
      Utils.createElement(
        "strong",
`forecast-v3__hero-value ${forecast.projectedFinal >= 0 ? "amount-positive" : "amount-negative"}`,
        Utils.formatMoney(forecast.projectedFinal)
      ),
      Utils.createElement(
        "p",
        "forecast-v3__note",
`\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043E\u0441\u043D\u043E\u0432\u0430\u043D \u043D\u0430 ${forecast.sampleSize} \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0445 \u043C\u0435\u0441\u044F\u0446\u0430\u0445, \u0441\u0440\u0435\u0434\u043D\u0435\u043C \u0434\u043E\u0445\u043E\u0434\u0435/\u0440\u0430\u0441\u0445\u043E\u0434\u0435 \u0438 \u0440\u0438\u0442\u043C\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0439.`
      )
    );

    const heroMeta = Utils.createElement("div", "forecast-v3__hero-meta");
    [
      ["\u0421\u0442\u0430\u0440\u0442 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u043C\u0435\u0441\u044F\u0446\u0430", Utils.formatMoney(forecast.startingBalance)],
      ["\u0412\u044B\u0431\u043E\u0440\u043A\u0430", `${forecast.sampleSize} \u043C\u0435\u0441.`]
    ].forEach(([label, value]) => {
      const stat = Utils.createElement("article", "forecast-v3__hero-stat");
      stat.append(
        Utils.createElement("span", "forecast-v3__eyebrow", label),
        Utils.createElement("strong", "", value)
      );
      heroMeta.appendChild(stat);
    });
    heroMain.appendChild(heroMeta);

    const metrics = Utils.createElement("div", "forecast-v3__metrics");
    [
      ["\u041F\u0440\u043E\u0433\u043D\u043E\u0437\u0438\u0440\u0443\u0435\u043C\u044B\u0439 \u0434\u043E\u0445\u043E\u0434", Utils.formatMoney(forecast.averageIncome)],
      ["\u041F\u0440\u043E\u0433\u043D\u043E\u0437\u0438\u0440\u0443\u0435\u043C\u044B\u0439 \u0440\u0430\u0441\u0445\u043E\u0434", Utils.formatMoney(forecast.averageExpense)],
      ["\u0427\u0438\u0441\u0442\u044B\u0439 \u043F\u043E\u0442\u043E\u043A \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0430", Utils.formatMoney(projectedNet)],
      ["\u0420\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u044B\u0435 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F", Utils.formatMoney(forecast.averageRecurring)],
      ["\u0414\u043E\u043B\u0433\u0438 \u0438 \u043A\u0440\u0435\u0434\u0438\u0442\u044B", Utils.formatMoney(forecast.averageDebt)],
      ["\u0411\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E \u043F\u043E\u0442\u0440\u0430\u0442\u0438\u0442\u044C", Utils.formatMoney(forecast.safeSpend)]
    ].forEach(([label, value]) => {
      const card = Utils.createElement("article", "forecast-v3__metric");
      card.append(
        Utils.createElement("span", "forecast-v3__eyebrow", label),
        Utils.createElement("strong", "", value)
      );
      metrics.appendChild(card);
    });

    const categories = Utils.createElement("section", "forecast-v3__categories");
    const categoriesCopy = Utils.createElement("div", "forecast-v3__categories-copy");
    categoriesCopy.append(
      Utils.createElement("span", "forecast-v3__eyebrow", "\u041A\u0440\u0443\u043F\u043D\u0435\u0439\u0448\u0438\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438"),
      Utils.createElement("strong", "forecast-v3__title", "\u041D\u0430 \u0447\u0442\u043E \u0443\u0439\u0434\u0435\u0442 \u043E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u0447\u0430\u0441\u0442\u044C \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432"),
      Utils.createElement(
        "p",
        "forecast-v3__categories-note",
        forecast.categoryForecast.length
          ? "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u0441 \u043D\u0430\u0438\u0431\u043E\u043B\u044C\u0448\u0438\u043C \u0432\u043A\u043B\u0430\u0434\u043E\u043C \u0432 \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0438\u0440\u0443\u0435\u043C\u044B\u0439 \u0440\u0430\u0441\u0445\u043E\u0434 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u043C\u0435\u0441\u044F\u0446\u0430."
          : "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043F\u043E \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F\u043C \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F, \u043A\u043E\u0433\u0434\u0430 \u043D\u0430\u043A\u043E\u043F\u0438\u0442\u0441\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0442\u0440\u0430\u0442."
      )
    );

    const list = Utils.createElement("div", "forecast-v3__list");
    const visibleCategoryForecast = forecast.categoryForecast.slice(0, 6);
    list.style.setProperty("--forecast-row-count", String(Math.max(1, visibleCategoryForecast.length)));
    list.style.gridTemplateRows = `repeat(${Math.max(1, visibleCategoryForecast.length)}, minmax(0, 1fr))`;
    const totalCategoryAmount = forecast.categoryForecast.reduce((sum, item) => sum + item.amount, 0) || 1;
    if (!visibleCategoryForecast.length) {
      list.appendChild(
        Utils.createElement(
          "div",
          "empty-state empty-state--compact",
          "\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u043F\u043E \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F\u043C \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F, \u043A\u043E\u0433\u0434\u0430 \u043D\u0430\u043A\u043E\u043F\u0438\u0442\u0441\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0442\u0440\u0430\u0442."
        )
      );
    } else {
      visibleCategoryForecast.forEach((item) => {
        const row = Utils.createElement("div", "forecast-v3__row");
        const mainRow = Utils.createElement("div", "forecast-v3__row-main");
        const categoryName = item.category?.name || "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F";
        const shareText = `${Utils.formatPercent((item.amount / totalCategoryAmount) * 100)} \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432`;
        const bar = Utils.createElement("span", "forecast-v3__bar");
        const fill = Utils.createElement("span", "forecast-v3__fill");
        const barName = Utils.createElement("span", "forecast-v3__bar-name", categoryName);
        const barLabel = Utils.createElement("span", "forecast-v3__bar-label", shareText);
        fill.style.width = `${Math.max(12, Math.min(100, (item.amount / totalCategoryAmount) * 100))}%`;
        fill.style.background = item.category?.color || "var(--info)";
        bar.title = `${categoryName}: ${shareText}`;
        bar.append(fill, barName, barLabel);
        mainRow.append(bar);
        row.append(
          mainRow,
          Utils.createElement("strong", "", Utils.formatMoney(item.amount))
        );
        list.appendChild(row);
      });
    }

    categories.append(categoriesCopy, list);
    main.append(heroMain, metrics);
    content.append(main, categories);
    shell.append(content);
    root.appendChild(shell);
  },
  renderPaymentCalendar() {
    const root = Utils.$("paymentCalendar");
    if (!root) {
      return;
    }
    const calendar = Store.paymentCalendar(Store.viewMonth);
    root.classList.add("payment-calendar--v2");
    root.replaceChildren();

    const activeDate = this.calendarSelectedDate && this.calendarSelectedDate.startsWith(Store.viewMonth)
      ? this.calendarSelectedDate
      : `${Store.viewMonth}-${String((calendar.days.find((item) => item.items.length)?.day || 1)).padStart(2, "0")}`;
    this.calendarSelectedDate = activeDate;

    const shell = Utils.createElement("div", "payment-calendar-v2__shell");
    const rail = Utils.createElement("div", "payment-calendar-v2__rail");
    const activeDays = calendar.days.filter((item) => item.items.length).length;
    const heavyDays = calendar.days.filter((item) => item.isHeavyExpense).length;

    const overview = Utils.createElement("article", "payment-calendar-v2__overview");
    const overviewMeta = Utils.createElement("div", "payment-calendar-v2__overview-meta");
    const activeMeta = Utils.createElement("div", "payment-calendar-v2__overview-stat");
    activeMeta.append(
      Utils.createElement("strong", "", String(activeDays)),
      Utils.createElement("span", "", "Активных дней")
    );
    const heavyMeta = Utils.createElement("div", "payment-calendar-v2__overview-stat");
    heavyMeta.append(
      Utils.createElement("strong", "", String(heavyDays)),
      Utils.createElement("span", "", "Крупных трат")
    );
      overview.append(
      Utils.createElement("span", "payment-calendar-v2__eyebrow", Utils.monthLabel(Store.viewMonth)),
      Utils.createElement("strong", "", "Движение денег по дням"),
      Utils.createElement(
        "p",
        "",
        activeDays
          ? "Нажмите на день, чтобы увидеть поступления, траты и состав операций."
          : "В этом месяце еще не было движения денег."
      ),
      overviewMeta
    );
    overviewMeta.append(activeMeta, heavyMeta);

    const board = Utils.createElement("div", "payment-calendar-v2__board");
    const grid = Utils.createElement("div", "payment-calendar-v2__grid");
    calendar.days.forEach((day) => {
      const date = `${Store.viewMonth}-${String(day.day).padStart(2, "0")}`;
      const hasIncome = (day.income || 0) > 0;
      const hasExpense = (day.expense || 0) > 0;
      const button = Utils.createElement(
        "button",
        `payment-calendar-v2__day${date === activeDate ? " is-selected" : ""}${day.isHeavyExpense ? " is-heavy" : ""}${day.items.length ? " has-items" : ""}`
      );
      button.type = "button";
      button.dataset.action = "select-calendar-day";
      button.dataset.date = date;
      button.title = day.items.length
        ? `Доходы: ${Utils.formatMoney(day.income || 0)} • Расходы: ${Utils.formatMoney(day.expense || 0)}`
        : "Без операций";

      const head = Utils.createElement("div", "payment-calendar-v2__day-head");
      head.appendChild(Utils.createElement("span", "payment-calendar-v2__day-number", String(day.day)));
      if (day.items.length) {
        head.appendChild(Utils.createElement("span", "payment-calendar-v2__day-badge", String(day.items.length)));
      }

      const signals = Utils.createElement("div", "payment-calendar-v2__day-signals");
      const incomeSignal = Utils.createElement("span", `payment-calendar-v2__day-signal payment-calendar-v2__day-signal--income${hasIncome ? " is-active" : ""}`);
      const expenseSignal = Utils.createElement("span", `payment-calendar-v2__day-signal payment-calendar-v2__day-signal--expense${hasExpense ? " is-active" : ""}`);
      signals.append(incomeSignal, expenseSignal);

      const dots = Utils.createElement("div", "payment-calendar-v2__day-dots");
      day.items.slice(0, 4).forEach((item) => {
        const dot = Utils.createElement("span", "payment-calendar-v2__day-dot");
        dot.style.background = Store.getCategory(item.categoryId)?.color || "#8b949e";
        dots.appendChild(dot);
      });

      button.append(head, signals, dots);
      grid.appendChild(button);
    });

    while (grid.childElementCount % 7 !== 0) {
      grid.appendChild(Utils.createElement("div", "payment-calendar-v2__placeholder"));
    }

    board.append(grid);
    rail.append(overview, board);

    const details = this.buildPaymentCalendarDetail(calendar, activeDate);

    shell.append(rail, details);
    root.appendChild(shell);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.syncPaymentCalendarLayout(root));
    });
  },

  renderAnalyticsBreakdownLegend() {
    const root = Utils.$("analyticsBreakdownLegend");
    if (!root) {
      return;
    }
    const breakdown = Store.expenseBreakdown(Store.viewMonth);
    root.replaceChildren();
    root.classList.toggle("is-scrollable", breakdown.length > 5);

    if (!breakdown.length) {
      root.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "Появится, как только появятся первые расходы."));
      return;
    }

    const total = breakdown.reduce((sum, item) => sum + item.amount, 0) || 1;
    const fragment = document.createDocumentFragment();
    breakdown.forEach((item) => {
      const row = Utils.createElement("div", "analytics-breakdown__item");
      const info = Utils.createElement("div", "analytics-breakdown__info");
      const swatch = Utils.createElement("span", "analytics-breakdown__swatch");
      swatch.style.background = item.category?.color || "#8b949e";
      const name = Utils.createElement("span", "analytics-breakdown__name", item.category?.name || "Категория");
      info.append(swatch, name);

      const meta = Utils.createElement("div", "analytics-breakdown__meta");
      const share = Utils.createElement("span", "analytics-breakdown__share", `${((item.amount / total) * 100).toFixed(1)}%`);
      const amount = Utils.createElement("strong", "", Utils.formatMoney(item.amount));
      meta.append(share, amount);

      row.append(info, meta);
      fragment.appendChild(row);
    });

    root.appendChild(fragment);
  },

  renderHeatmap() {
    const root = Utils.$("heatmapWrap");
    if (!root) {
      return;
    }
    if (!this.heatmapMonth) {
      this.heatmapMonth = Store.viewMonth;
    }
    const monthKey = this.heatmapMonth || Store.viewMonth;
    const days = Store.heatmapDays(monthKey);
    const max = Math.max(...days.map((item) => item.amount), 0);
    const activeDays = days.filter((item) => item.amount > 0);
    const peakDay = activeDays.reduce((best, item) => (item.amount > (best?.amount || 0) ? item : best), null);
    const totalSpend = activeDays.reduce((sum, item) => sum + item.amount, 0);

    root.className = "heatmap-v2";
    root.replaceChildren();

    const overview = Utils.createElement("article", "heatmap-v2__overview");
    const overviewMeta = Utils.createElement("div", "heatmap-v2__overview-meta");
    [
      [String(activeDays.length), "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0434\u043D\u0435\u0439"],
      [peakDay ? `\u0414\u0435\u043D\u044C ${peakDay.day}` : "\u2014", peakDay ? Utils.formatMoney(peakDay.amount) : "\u041F\u043E\u043A\u0430 \u0431\u0435\u0437 \u0442\u0440\u0430\u0442"],
      [Utils.formatMoney(totalSpend), "\u0422\u0440\u0430\u0442 \u0437\u0430 \u043C\u0435\u0441\u044F\u0446"]
    ].forEach(([value, note]) => {
      const stat = Utils.createElement("div", "heatmap-v2__overview-stat");
      stat.append(
        Utils.createElement("strong", "", value),
        Utils.createElement("span", "", note)
      );
      overviewMeta.appendChild(stat);
    });
    overview.append(
      Utils.createElement("span", "heatmap-v2__eyebrow", Utils.monthLabel(monthKey)),
      Utils.createElement("strong", "", "\u0418\u043D\u0442\u0435\u043D\u0441\u0438\u0432\u043D\u043E\u0441\u0442\u044C \u0442\u0440\u0430\u0442"),
      Utils.createElement("p", "", activeDays.length ? "\u0421\u0435\u0442\u043A\u0430 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442, \u0432 \u043A\u0430\u043A\u0438\u0435 \u0434\u043D\u0438 \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0431\u044B\u043B\u0438 \u0437\u0430\u043C\u0435\u0442\u043D\u0435\u0435." : "\u041F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0432\u044B\u0445 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432 \u0437\u0434\u0435\u0441\u044C \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043A\u0430\u0440\u0442\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438 \u043F\u043E \u0434\u043D\u044F\u043C."),
      overviewMeta
    );

    const board = Utils.createElement("div", "heatmap-v2__board");
    const boardHead = Utils.createElement("div", "heatmap-v2__board-head");
    const nav = Utils.createElement("div", "heatmap-v2__nav");
    const prevBtn = Utils.createElement("button", "icon-btn icon-btn--tiny heatmap-v2__nav-btn", "\u2190");
    prevBtn.type = "button";
    prevBtn.dataset.action = "shift-heatmap-month";
    prevBtn.dataset.delta = "-1";
    prevBtn.title = "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043C\u0435\u0441\u044F\u0446";
    const nextBtn = Utils.createElement("button", "icon-btn icon-btn--tiny heatmap-v2__nav-btn", "\u2192");
    nextBtn.type = "button";
    nextBtn.dataset.action = "shift-heatmap-month";
    nextBtn.dataset.delta = "1";
    nextBtn.title = "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043C\u0435\u0441\u044F\u0446";
    nav.append(prevBtn, nextBtn);
    boardHead.append(Utils.createElement("span", "heatmap-v2__board-caption", Utils.shortMonthLabel(monthKey)), nav);
    const grid = Utils.createElement("div", "heatmap-v2__grid");
    days.forEach((item) => {
      const cell = Utils.createElement(
        "div",
`heatmap-v2__day${item.amount > 0 ? " has-activity" : ""}`
      );
      const intensity = max ? item.amount / max : 0;
      if (item.amount > 0) {
        const hue = Math.round(204 - intensity * 18);
        const saturation = Math.round(26 + intensity * 32);
        const lightness = Math.round(18 + intensity * 16);
        const alpha = 0.14 + intensity * 0.34;
        const topColor = `hsla(${hue}, ${Math.min(58, saturation + 10)}%, ${Math.min(46, lightness + 8)}%, ${Math.min(0.56, alpha + 0.1).toFixed(3)})`;
        const bottomColor = `hsla(${Math.max(176, hue - 10)}, ${saturation}%, ${lightness}%, ${alpha.toFixed(3)})`;
        const borderColor = `hsla(${hue}, ${Math.min(62, saturation + 8)}%, ${Math.min(50, lightness + 8)}%, ${(0.18 + intensity * 0.2).toFixed(3)})`;
        const glowColor = `hsla(${hue}, ${Math.min(56, saturation + 6)}%, ${Math.min(48, lightness + 6)}%, ${(0.05 + intensity * 0.08).toFixed(3)})`;
        cell.style.background = `linear-gradient(180deg, ${topColor} 0%, ${bottomColor} 100%)`;
        cell.style.borderColor = borderColor;
        cell.style.boxShadow = `inset 0 0 0 1px ${borderColor}, 0 0 6px ${glowColor}`;
      }
      cell.title = `\u0414\u0435\u043D\u044C ${item.day}: ${item.amount ? Utils.formatMoney(item.amount) : "0 \u20BD"}`;

      const dayLabel = Utils.createElement("span", "heatmap-v2__day-num", String(item.day));
      const amountLabel = Utils.createElement(
        "strong",
        "heatmap-v2__day-amount",
        item.amount ? Utils.formatMoney(item.amount) : "\u2014"
      );
      cell.append(dayLabel, amountLabel);
      grid.appendChild(cell);
    });
    const hint = Utils.createElement("button", "heatmap-v2__hint", "\u24D8");
    const hintBubble = Utils.createElement("div", "heatmap-v2__hint-bubble");
    const hintText = "\u0427\u0435\u043C \u044F\u0440\u0447\u0435 \u044F\u0447\u0435\u0439\u043A\u0430, \u0442\u0435\u043C \u0431\u043E\u043B\u044C\u0448\u0435 \u0431\u044B\u043B\u043E \u0442\u0440\u0430\u0442 \u0432 \u044D\u0442\u043E\u0442 \u0434\u0435\u043D\u044C. \u0427\u0435\u043C \u0431\u043B\u0435\u0434\u043D\u0435\u0435 \u044F\u0447\u0435\u0439\u043A\u0430, \u0442\u0435\u043C \u043C\u0435\u043D\u044C\u0448\u0435 \u0431\u044B\u043B\u043E \u0442\u0440\u0430\u0442 \u0432 \u044D\u0442\u043E\u0442 \u0434\u0435\u043D\u044C.";
    hint.type = "button";
    hint.dataset.action = "toggle-heatmap-hint";
    hint.dataset.tooltip = hintText;
    hint.setAttribute("aria-label", "\u041A\u0430\u043A \u0447\u0438\u0442\u0430\u0442\u044C \u0442\u0435\u043F\u043B\u043E\u0432\u0443\u044E \u043A\u0430\u0440\u0442\u0443");
    hint.setAttribute("aria-expanded", "false");
    hint.setAttribute("aria-pressed", "false");
    hint.setAttribute("aria-controls", "heatmapHintBubble");
    hintBubble.id = "heatmapHintBubble";
    hintBubble.textContent = hintText;
    hintBubble.setAttribute("role", "note");
    hintBubble.hidden = true;
    board.append(boardHead, grid, hint, hintBubble);
    root.append(overview, board);
    if (typeof UI !== "undefined" && typeof UI.setHeatmapHintOpen === "function") {
      UI.setHeatmapHintOpen(false);
    }
  },
  renderRecurring() {
    const root = Utils.$("recurringList");
    if (!root) {
      return;
    }
    const items = Store.recurringCandidates();
    if (!items.length) {
      root.replaceChildren(Utils.createElement("div", "empty-state", "Повторяющиеся расходы пока не обнаружены."));
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const card = Utils.createElement("article", "recurring-card");
      card.title = item.title;
      const head = Utils.createElement("div", "recurring-card__head");
      const title = Utils.createElement("strong", "", item.title);
      title.title = item.title;
      const jumpButton = Utils.createElement("button", "icon-btn icon-btn--tiny recurring-card__jump", "↗");
      jumpButton.type = "button";
      jumpButton.title = "Показать похожие операции в бюджете";
      jumpButton.setAttribute("aria-label", "Показать похожие операции в бюджете");
      jumpButton.dataset.action = "open-recurring-budget";
      jumpButton.dataset.query = item.title;
      const meta = Utils.createElement("div", "transaction-card__meta");
      meta.append(
        Utils.createElement("span", "", `${item.repeats} мес. повторения`),
        Utils.createElement("span", "", `${Utils.formatMoney(item.averageAmount)} в среднем`),
        Utils.createElement("span", "", item.category?.name || "Категория")
      );
      card.append(
        head,
        meta
      );
      head.append(title, jumpButton);
      fragment.appendChild(card);
    });
    root.replaceChildren(fragment);
  },

  renderDeepStats() {
    const root = Utils.$("deepStats");
    if (!root) {
      return;
    }
    const stats = Store.statsForMonth(Store.viewMonth);
    const activeDays = stats.trend.filter((item) => item.income > 0 || item.expense > 0).length;
    const [year, month] = Store.viewMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const expenseOperations = Store.getTransactions("month", Store.viewMonth)
      .filter((transaction) => transaction.type === "expense").length;
    const transactionContext = (transaction) => {
      if (!transaction) return "";
      const category = Store.getCategory(transaction.categoryId)?.name || "Без категории";
      return `${category} · ${Utils.formatDate(transaction.date)}`;
    };
    const items = [
      {
        title: "Крупнейший расход",
        value: stats.topExpense ? Utils.formatMoney(stats.topExpense.amount) : "Нет данных",
        note: stats.topExpense ? stats.topExpense.description : "Добавьте расходы",
        context: stats.topExpense ? transactionContext(stats.topExpense) : "Операций пока нет"
      },
      {
        title: "Крупнейший доход",
        value: stats.topIncome ? Utils.formatMoney(stats.topIncome.amount) : "Нет данных",
        note: stats.topIncome ? stats.topIncome.description : "Добавьте доход",
        context: stats.topIncome ? transactionContext(stats.topIncome) : "Операций пока нет"
      },
      {
        title: "Топ-категория",
        value: stats.topCategory ? stats.topCategory.name : "Нет данных",
        note: stats.topCategory ? `${Utils.formatMoney(stats.topCategoryAmount)} · ${Utils.formatPercent(stats.concentration)} расходов` : "Структура появится после трат",
        context: expenseOperations ? `${expenseOperations} расходных операций в месяце` : "Расходов пока нет"
      },
      {
        title: "Средний расход в день",
        value: Utils.formatMoney(stats.averageExpensePerDay),
        note: "Средняя сумма расходов на календарный день выбранного месяца.",
        context: `${Utils.formatMoney(stats.totals.expense)} за ${daysInMonth} дн.`
      },
      {
        title: "Остаток на конец",
        value: Utils.formatMoney(stats.finalBalance),
        note: "Сумма после всех доходов и расходов выбранного месяца.",
        context: `Старт месяца: ${Utils.formatMoney(stats.startBalance)}`
      },
      {
        title: "Активных дней",
        value: String(activeDays),
        note: activeDays
          ? `Движение денег было в ${activeDays} из ${daysInMonth} дней.`
          : "В этом месяце пока не было операций.",
        context: `${stats.operations} операций за месяц`
      }
    ];
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const card = Utils.createElement("article", "deep-stat");
      const value = Utils.createElement("div", "deep-stat__value", item.value);
      const note = Utils.createElement("small", "deep-stat__note", item.note);
      const context = Utils.createElement("small", "deep-stat__context", item.context);
      card.append(
        Utils.createElement("strong", "", item.title),
        value,
        note,
        context
      );
      fragment.appendChild(card);
    });
    root.replaceChildren(fragment);
  },

});
