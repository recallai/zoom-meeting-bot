// Observe participant list and build avatar→name / abbrev→name map
async function startParticipantObserver(page) {
  const participantsButton = page.getByRole("button", {
    name: "open the participants list",
  });

  // double click since it doesn't open on the first click
  await participantsButton.dblclick();

  await page.evaluate(() => {
    if (window.__participantMapObserver) return;

    window.__participantMap = {};

    const buildMap = () => {
      const map = {};
      const items = document.querySelectorAll(
        ".participants-item__item-layout"
      );
      items.forEach((item) => {
        const nameEl = item.querySelector(".participants-item__display-name");
        if (!nameEl) return;
        const displayName = nameEl.textContent.trim();

        const avatar = item.querySelector(".participants-item__avatar");
        if (!avatar) return;

        let key = "";
        if (avatar.tagName === "IMG") {
          key = avatar.src; // map img src
        } else {
          key = avatar.textContent.trim(); // abbreviation text
        }

        if (key) map[key] = displayName;
      });

      window.__participantMap = map;
    };

    // Initial build and monitor for changes.
    buildMap();

    const listContainer = document.querySelector(
      ".ReactVirtualized__Grid__innerScrollContainer[role='rowgroup']"
    );
    if (!listContainer) {
      console.warn(
        "[participants] list container not found – open participant panel?"
      );
      return;
    }

    const obs = new MutationObserver(() => buildMap());
    obs.observe(listContainer, { childList: true, subtree: true });

    window.__participantMapObserver = obs;
  });
}

// Enable captions once inside the meeting
async function enableCaptions(page) {
  try {
    // 1. Ensure the "More" overflow menu opens; retry if the Captions item is not revealed.
    const moreButton = page.getByRole("button", { name: "More", exact: true });
    await moreButton.waitFor({ timeout: 15_000 });

    const captionsItem = page.getByLabel("Captions");

    // double click since it doesn't open on the first click
    await moreButton.dblclick();

    // 2. Click the "Captions" toggle in the menu.
    await captionsItem.click();

    // brief pause to let the UI register the first click before the second
    await page.waitForTimeout(300);
    await captionsItem.click();

    // 3. Detect whether a confirmation toast appears – if so, captions are
    //    already on and no further action is needed. Otherwise, fall back to
    //    opening the settings dialog and saving.
    //    toast wording varies and sometimes truncates the word "captions" –
    //    match both forms.
    // Toast may show "captions" or "transcription", and appears twice (alert + visible).
    // Use .first() to avoid strict-mode errors when multiple matches exist.
    const toast = page
      .locator(
        "text=/you have (enabled|turned on) live (?:captions?|transcription)/i"
      )
      .first();

    let toastSeen = false;
    try {
      await toast.waitFor({ timeout: 3_000 });
      toastSeen = true;
    } catch (err) {
      // no toast – we'll open settings next
      console.log(
        "[captions] toast not seen within timeout; opening settings dialog"
      );
      console.warn("[captions] toast wait error:", err.message);
    }

    if (!toastSeen) {
      // Hit "Save" to save the caption setting.
      const saveBtn = page.getByRole("button", { name: "Save" });
      await saveBtn.waitFor({ timeout: 10_000 });
      await saveBtn.click();
    }

    console.log("💬  Captions enabled");
  } catch (err) {
    console.warn("⚠️  Could not enable captions:", err.message);
  }
}

async function startCaptionLogging(page) {
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();

    // Relay browser console messages prefixed with "CAPTION: " back to Node.
    if (type === "log" && text.startsWith("CAPTION: ")) {
      // Remove "CAPTION: " prefix (9 characters) to keep output clean
      console.log(text.slice(9));
      return;
    }
  });

  await page.evaluate(() => {
    // Tear down any previous observers to avoid multiples (helps on reconnect).
    if (window.__zoomCaptionObservers) {
      window.__zoomCaptionObservers.forEach((obs) => obs.disconnect());
      window.__zoomCaptionObservers.clear();
    }
    if (window.__zoomCaptionPollers) {
      window.__zoomCaptionPollers.forEach((poller) => clearInterval(poller));
      window.__zoomCaptionPollers = [];
    }

    // Track start time for relative timestamps.
    if (!window.__zoomBotStartTime) {
      window.__zoomBotStartTime = Date.now();
    }

    // Helper function to extract speaker name from an icon element
    const getSpeakerFromIcon = (iconEl) => {
      if (!iconEl) return "";

      if (iconEl.tagName === "IMG") {
        const src = iconEl.src;
        return (window.__participantMap && window.__participantMap[src]) || "";
      } else {
        const abbrev = iconEl.textContent.trim();
        if (window.__participantMap && window.__participantMap[abbrev]) {
          return window.__participantMap[abbrev];
        }
        return abbrev;
      }
    };

    // Helper function to extract speaker name from a caption container
    // Looks for an icon element and maps it to the full participant name if available
    const getSpeakerForContainer = (container) => {
      const iconEl = container.querySelector(".zmu-data-selector-item__icon");
      return getSpeakerFromIcon(iconEl);
    };

    const getSpeakerForItem = (item) => {
      // look for icon inside the item first
      const iconEl = item.querySelector(
        ".zmu-data-selector-item__icon, .zmu-caption-speaker-icon"
      );

      if (iconEl) {
        return getSpeakerFromIcon(iconEl);
      }

      // fallback to container-based speaker detection
      const container = item.closest("#live-transcription-subtitle");
      return container ? getSpeakerForContainer(container) : "";
    };

    const attachCaptionObserver = (container) => {
      // Track observers in a Set instead of single observer
      if (!window.__zoomCaptionObservers) {
        window.__zoomCaptionObservers = new Set();
      }

      // Skip if we already attached to this specific container
      if (container.__hasZoomObserver) return;
      container.__hasZoomObserver = true;

      // Track last seen text per caption element (since each speaker gets their own element)
      const lastSeenTextByElement = new WeakMap();

      const checkForTextChanges = () => {
        const captionSpans = container.querySelectorAll(
          ".live-transcription-subtitle__item"
        );

        console.log(
          `[captions-debug] Found ${captionSpans.length} caption spans`
        );

        captionSpans.forEach((captionSpan, _) => {
          const currentText = (captionSpan.innerText || "").trim();
          const lastText = lastSeenTextByElement.get(captionSpan) || "";

          if (!currentText || currentText === lastText) return;

          const speaker = getSpeakerForItem(captionSpan);
          const payload = [
            {
              speaker,
              text: currentText,
              time: parseFloat(
                ((Date.now() - window.__zoomBotStartTime) / 1000).toFixed(2)
              ),
            },
          ];
          console.log("CAPTION: " + JSON.stringify(payload));
          lastSeenTextByElement.set(captionSpan, currentText);
        });
      };

      // Watch for text content changes in the container
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === "childList" ||
            mutation.type === "characterData"
          ) {
            checkForTextChanges();
          }
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Also poll every 500ms as a backup
      const pollInterval = setInterval(checkForTextChanges, 500);

      window.__zoomCaptionObservers.add(observer);
      if (!window.__zoomCaptionPollers) window.__zoomCaptionPollers = [];
      window.__zoomCaptionPollers.push(pollInterval);
      console.log(
        `[captions] observer attached to container id="${container.id}"`
      );
    };

    // Find and attach observers to ALL caption containers (one per speaker)
    const attachToAllCaptionContainers = () => {
      const captionContainers = document.querySelectorAll(
        "#live-transcription-subtitle, [id*=live-transcription], [class*=live-transcription]"
      );

      console.log(
        `[captions] Found ${captionContainers.length} caption containers`
      );

      captionContainers.forEach((container, index) => {
        console.log(
          `[captions] Attaching to container ${index}: id="${container.id}" class="${container.className}"`
        );
        attachCaptionObserver(container);
      });

      return captionContainers.length > 0;
    };

    if (attachToAllCaptionContainers()) {
      // Found containers immediately
    } else {
      console.warn("[captions] no containers found - waiting for first line…");

      const waitObserver = new MutationObserver(() => {
        if (attachToAllCaptionContainers()) {
          waitObserver.disconnect();
        }
      });
      waitObserver.observe(document.body, { childList: true, subtree: true });
    }
  });
}

module.exports = {
  startParticipantObserver,
  startCaptionLogging,
  enableCaptions,
};
