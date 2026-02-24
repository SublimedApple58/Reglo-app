export const mockRequireServiceAccess = (companyId = "company_test") => {
  return jest.fn().mockResolvedValue({
    membership: {
      companyId,
      role: "OWNER",
      userId: "user_test",
    },
  });
};
