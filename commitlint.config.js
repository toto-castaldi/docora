export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2, //Error - Commit is rejected if does not match rules
            'always',
            [
                'feat',     // New feature
                'fix',      // Bug fix
                'docs',     // Documentation
                'style',    // Formatting (no code change)
                'refactor', // Code restructuring
                'perf',     // Performance improvement
                'test',     // Adding tests
                'chore',    // Maintenance tasks
                'ci',       // CI/CD changes
                'build',    // Build system changes
            ]
        ],
        'subject-case': [2, 'always', 'lower-case'],
        'header-max-length': [2, 'always', 100]
    }
};