module.exports = {
  root: true,
  extends: ['../../packages/config/eslint.base.cjs', 'plugin:vue/recommended'],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    extraFileExtensions: ['.vue'],
  },
  rules: {
    'vue/attributes-order': 'off',
    'vue/first-attribute-linebreak': 'off',
    'vue/html-closing-bracket-newline': 'off',
    'vue/html-self-closing': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/multiline-html-element-content-newline': 'off',
    'vue/no-multi-spaces': 'off',
    'vue/no-v-for-template-key': 'off',
    'vue/singleline-html-element-content-newline': 'off',
  },
};
