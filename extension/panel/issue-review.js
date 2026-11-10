function setupIssueReview(getCurrentConfirmations, saveConfirmation, setStatus) {
  const sellerIssues = document.getElementById("sellerIssues");
  const userIssueList = document.getElementById("userIssueList");
  const addIssueForm = document.getElementById("addIssueForm");
  const issueChoice = document.getElementById("issueChoice");
  const confirmIssues = document.getElementById("confirmIssues");
  const editIssues = document.getElementById("editIssues");
  const userIssueStatus = document.getElementById("userIssueStatus");

  function showSellerIssues(post, userIssues = []) {
    userIssueList.replaceChildren();
    sellerIssues.hidden = !post;
    if (!post) return;

    const locked = Boolean(post.issuesVerified);
    addIssueForm.hidden = locked;
    confirmIssues.hidden = locked;
    editIssues.hidden = !locked;
    if (locked) setStatus(userIssueStatus, userIssues.length
      ? "Issues confirmed."
      : "Confirmed with no observations.");
    for (const issue of userIssues) {
      appendUserIssue(issue, locked);
    }
  }

  function appendUserIssue(issue, locked) {
    const row = document.createElement("li");
    row.textContent = issue.name;
    if (!locked) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-issue";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + issue.name);
      remove.title = "Remove " + issue.name;
      remove.addEventListener("click", () => {
        const current = getCurrentConfirmations();
        if (!current) return;
        const { post, userIssues = [] } = current;
        if (!post || post.issuesVerified) return;
        saveConfirmation("userIssues", userIssues.filter((item) => item.issueId !== issue.issueId));
        setStatus(userIssueStatus, "Issue removed.");
      });
      row.append(" ", remove);
    }
    userIssueList.append(row);
  }

  addIssueForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const current = getCurrentConfirmations();
    if (!current || !issueChoice.value) return;
    const { post, userIssues = [] } = current;
    if (!post || post.issuesVerified) return;

    const issueId = "user-" + issueChoice.value;
    if (userIssues.some((issue) => issue.issueId === issueId)) {
      setStatus(userIssueStatus, "You already added that issue.", true);
      return;
    }
    const name = issueChoice.selectedOptions[0].textContent;
    const issue = { issueId, name, category: "user-added", sourceText: null, reviewed: true, status: "reviewed" };
    saveConfirmation("userIssues", [...userIssues, issue]);
    issueChoice.value = "";
    setStatus(userIssueStatus, name + " added.");
  });

  confirmIssues.addEventListener("click", () => {
    const post = getCurrentConfirmations()?.post;
    if (!post || post.issuesVerified) return;
    saveConfirmation("post", { ...post, issuesVerified: true });
    editIssues.focus();
  });

  editIssues.addEventListener("click", () => {
    const post = getCurrentConfirmations()?.post;
    if (!post?.issuesVerified) return;
    saveConfirmation("post", { ...post, issuesVerified: false });
    setStatus(userIssueStatus, "Confirm again when you’re done editing.");
    issueChoice.focus();
  });

  function resetIssueReview() {
    issueChoice.value = "";
    setStatus(userIssueStatus, "");
    showSellerIssues(null);
  }

  return { show: showSellerIssues, reset: resetIssueReview };
}
