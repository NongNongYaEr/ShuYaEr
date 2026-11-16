import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import test from 'node:test';
import { wikiCategories } from '../web/help-wiki-content.js';
import { wikiImageMarkers } from '../web/help-wiki-markers.js';

const assets = new URL('../web/help-wiki-assets/', import.meta.url);
const articles = wikiCategories.flatMap(category => category.groups.flatMap(group => group.articles));

function figuresFor(article) {
  return [
    article.figure,
    article.comparison?.before,
    article.comparison?.after,
    ...article.sections.flatMap(section => [section.figure, ...(section.steps || []).map(step => step.figure)]),
  ].filter(Boolean);
}

test('every Wiki article includes an actual screenshot with a local image and caption', async () => {
  const ids = new Set();
  for (const article of articles) {
    assert.ok(!ids.has(article.id), 'Duplicate article ID: ' + article.id);
    ids.add(article.id);
    const figures = figuresFor(article);
    assert.ok(figures.some(figure => figure.kind !== 'illustration'), article.title + ' 缺少软件截图');
    for (const figure of figures) {
      assert.match(figure.src, /^[a-z0-9-]+\.(webp|png|jpe?g)$/i);
      assert.ok(figure.alt?.trim() && figure.caption?.trim(), 'Missing description for ' + figure.src);
      assert.ok(Number.isInteger(figure.width) && figure.width > 0 && Number.isInteger(figure.height) && figure.height > 0,
        'Missing image dimensions for ' + figure.src);
      assert.ok((await stat(new URL(figure.src, assets))).size > 0, 'Empty figure ' + figure.src);
    }
  }
});

test('screenshots point to actual controls and each tutorial describes an outcome', () => {
  for (const article of articles) {
    const steps = article.sections.flatMap(section => section.steps || []);
    assert.ok(steps.some(step => step.figure && step.check?.trim()), article.title + ' 缺少可核对的操作步骤');
    for (const figure of figuresFor(article)) {
      if (figure.kind === 'illustration') continue;
      const markers = wikiImageMarkers[figure.src];
      assert.ok(markers?.length, figure.src + ' 缺少操作圈号');
      if (figure.markers) {
        assert.ok(figure.markers.length && new Set(figure.markers).size === figure.markers.length,
          figure.src + ' 的圈号为空或重复');
        assert.ok(figure.markers.every(index => Number.isInteger(index) && index > 0 && index <= markers.length),
          figure.src + ' 引用了不存在的圈号');
      }
      for (const { x, y, w, h, label } of markers) {
        assert.ok([x, y, w, h].every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0
          && x + w <= 100.0001 && y + h <= 100.0001, figure.src + ' 的圈号越界');
        assert.ok(label?.trim(), figure.src + ' 的圈号没有对应说明');
      }
    }
  }
});

test('the staged GLB workflow illustrates topology, UV and material separately', () => {
  const article = articles.find(item => item.id === 'staged-model');
  assert.ok(article);
  const exportPhotos = [
    ['拓扑 GLB', 'staged-topology.webp'],
    ['UV GLB', 'staged-uv.webp'],
    ['材质 GLB', 'staged-check-save.webp'],
  ];
  for (const [stage, src] of exportPhotos) {
    const section = article.sections.find(item => item.title.startsWith(stage));
    assert.ok(section?.steps.some(step => step.figure?.src === src), stage + ' 缺少对应导出截图');
  }
});

test('whole-tree cases have illustrated workflows and valid related tutorials', () => {
  const knownIds = new Set(articles.map(article => article.id));
  const cases = articles.filter(item => item.caseInput);
  assert.equal(cases.length, 3);
  for (const article of cases) {
    assert.ok(article.comparison?.before && article.comparison?.after, article.title + ' 缺少起点或成品截图');
    assert.notEqual(article.comparison.before.src, article.comparison.after.src, article.title + ' 对照图片重复');
    const steps = article.sections.flatMap(section => section.steps || []);
    assert.ok(steps.length > 3, article.title + ' 缺少完整流程');
    assert.ok(steps.some(step => step.related?.length), article.title + ' 缺少专项教程入口');
    for (const step of steps) {
      assert.ok(step.figure && step.check && (step.text || step.actions?.length), article.title + ' 缺少图文步骤');
      for (const id of step.related || []) {
        assert.ok(knownIds.has(id) && id !== article.id, article.title + ' 的专项链接无效：' + id);
      }
    }
  }
});
