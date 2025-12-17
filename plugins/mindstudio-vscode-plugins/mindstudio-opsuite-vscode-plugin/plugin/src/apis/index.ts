export const apis = {
  'demo-api': (params: { projectId: number }): string => {
    console.log('demo-api params:', params);
    return 'success';
  },
};
